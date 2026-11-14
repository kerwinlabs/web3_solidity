#!/usr/bin/env node
import 'dotenv/config';
import {
  createWalletClient,
  encodeAbiParameters,
  formatUnits,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { erc20Abi, marketAbi, nftAbi } from './abi.js';
import { chain, publicClient } from './client.js';
import { config } from './config.js';

// anvil 默认测试账户（私钥是公开已知的，只用于本地链）。
const ANVIL_DEFAULT_KEYS = {
  seller: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  buyer: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
};

function readPrivateKey(name, fallback) {
  const value = (process.env[name] ?? '').trim() || fallback;
  if (!value) return undefined;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`环境变量 ${name} 不是合法的 32 字节私钥`);
  }
  return value;
}

const sellerKey = readPrivateKey('SELLER_PRIVATE_KEY', ANVIL_DEFAULT_KEYS.seller);
const buyerKey = readPrivateKey('BUYER_PRIVATE_KEY', ANVIL_DEFAULT_KEYS.buyer);

if (config.chainId !== 31337 && (!process.env.SELLER_PRIVATE_KEY || !process.env.BUYER_PRIVATE_KEY)) {
  throw new Error(
    '当前不是 anvil(31337)，必须显式设置 SELLER_PRIVATE_KEY 和 BUYER_PRIVATE_KEY，禁止使用默认测试私钥',
  );
}

const sellerAccount = privateKeyToAccount(sellerKey);
const buyerAccount = privateKeyToAccount(buyerKey);

const sellerWallet = createWalletClient({
  account: sellerAccount,
  chain,
  transport: http(config.rpcUrl),
});
const buyerWallet = createWalletClient({
  account: buyerAccount,
  chain,
  transport: http(config.rpcUrl),
});

const stepDelay = Number(process.env.DEMO_STEP_DELAY_MS ?? 1500);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 发送交易并等待上链，打印每一步的哈希和区块号。 */
async function send(label, wallet, request) {
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`${label} 失败，交易哈希：${hash}`);
  }
  console.log(`✅ ${label}`);
  console.log(`   交易: ${hash}`);
  console.log(`   区块: ${receipt.blockNumber}`);
  if (stepDelay > 0) await sleep(stepDelay);
  return receipt;
}

function formatTokenAmount(value, decimals, symbol) {
  return `${formatUnits(value, decimals)} ${symbol}`;
}

async function main() {
  // 0. 基本检查：链 ID、市场地址、买卖双方地址。
  const onChainId = await publicClient.getChainId();
  if (onChainId !== config.chainId) {
    throw new Error(`CHAIN_ID=${config.chainId} 与 RPC 实际链 ID ${onChainId} 不一致`);
  }
  if (!config.marketAddress) {
    throw new Error(
      'MARKET_ADDRESS 未配置。npm run demo 仅用于 NFTMarket 演示；TokenBank 转账请用 npm run transfer',
    );
  }
  if (sellerAccount.address.toLowerCase() === buyerAccount.address.toLowerCase()) {
    throw new Error('卖家与买家不能是同一个地址，否则合约会拒绝购买自己的 NFT');
  }

  const [tokenAddress, nftAddress] = await Promise.all([
    publicClient.readContract({ address: config.marketAddress, abi: marketAbi, functionName: 'token' }),
    publicClient.readContract({ address: config.marketAddress, abi: marketAbi, functionName: 'nft' }),
  ]);
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const price = parseEther(process.env.DEMO_PRICE ?? '100');

  console.log('════════════════════════════════════════════════════════');
  console.log(' NFTMarket 演示交易');
  console.log(` 市场合约 : ${config.marketAddress}`);
  console.log(` 支付代币 : ${tokenAddress} (${symbol})`);
  console.log(` NFT 合约 : ${nftAddress}`);
  console.log(` 卖家     : ${sellerAccount.address}`);
  console.log(` 买家     : ${buyerAccount.address}`);
  console.log(` 单价     : ${formatTokenAmount(price, decimals, symbol)}`);
  console.log('════════════════════════════════════════════════════════\n');

  // ========== 第 1 个 NFT：approve + list + buyNFT ==========
  const firstId = await publicClient.readContract({
    address: nftAddress,
    abi: nftAbi,
    functionName: '_nextTokenId',
  });

  await send(`卖家铸造 NFT #${firstId}`, sellerWallet, {
    address: nftAddress,
    abi: nftAbi,
    functionName: 'mint',
    args: [sellerAccount.address, `ipfs://nftmarket/${firstId}.json`],
  });

  await send(`卖家授权市场操作 NFT #${firstId}`, sellerWallet, {
    address: nftAddress,
    abi: nftAbi,
    functionName: 'approve',
    args: [config.marketAddress, firstId],
  });

  await send(`卖家上架 NFT #${firstId}，价格 ${formatTokenAmount(price, decimals, symbol)}`, sellerWallet, {
    address: config.marketAddress,
    abi: marketAbi,
    functionName: 'list',
    args: [firstId, price],
  });

  // 买家需要 MTK 才能购买：不足时由卖家（代币部署者）转过去。
  const budget = price * 2n;
  const buyerBalance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [buyerAccount.address],
  });
  if (buyerBalance < budget) {
    const topUp = budget - buyerBalance;
    const sellerBalance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [sellerAccount.address],
    });
    if (sellerBalance < topUp) {
      throw new Error(
        `卖家 MTK 余额不足：需要 ${topUp}，实际 ${sellerBalance}（卖家必须是部署 CalledToken 的账户）`,
      );
    }
    await send(`卖家给买家转 ${formatTokenAmount(topUp, decimals, symbol)}`, sellerWallet, {
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [buyerAccount.address, topUp],
    });
  } else {
    console.log(`ℹ️  买家已有 ${formatTokenAmount(buyerBalance, decimals, symbol)}，无需转账\n`);
  }

  await send(`买家授权市场使用 ${formatTokenAmount(price, decimals, symbol)}`, buyerWallet, {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [config.marketAddress, price],
  });

  await send(`买家 buyNFT 购买 NFT #${firstId}`, buyerWallet, {
    address: config.marketAddress,
    abi: marketAbi,
    functionName: 'buyNFT',
    args: [firstId, price],
  });

  // ========== 第 2 个 NFT：transferAndCall 直接购买 ==========
  const secondId = await publicClient.readContract({
    address: nftAddress,
    abi: nftAbi,
    functionName: '_nextTokenId',
  });

  await send(`铸造 NFT #${secondId}`, sellerWallet, {
    address: nftAddress,
    abi: nftAbi,
    functionName: 'mint',
    args: [sellerAccount.address, `ipfs://nftmarket/${secondId}.json`],
  });

  await send(`卖家授权市场操作 NFT #${secondId}`, sellerWallet, {
    address: nftAddress,
    abi: nftAbi,
    functionName: 'approve',
    args: [config.marketAddress, secondId],
  });

  await send(`卖家上架 NFT #${secondId}，价格 ${formatTokenAmount(price, decimals, symbol)}`, sellerWallet, {
    address: config.marketAddress,
    abi: marketAbi,
    functionName: 'list',
    args: [secondId, price],
  });

  // transferAndCall 的数据是 abi.encode(tokenId)，市场在 onTokensReceived 里解码。
  const data = encodeAbiParameters([{ type: 'uint256' }], [secondId]);
  await send(`买家 transferAndCall 直接购买 NFT #${secondId}（触发 onTokensReceived）`, buyerWallet, {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'transferAndCall',
    args: [config.marketAddress, price, data],
  });

  // ========== 结果确认 ==========
  const [owner1, owner2] = await Promise.all([
    publicClient.readContract({ address: nftAddress, abi: nftAbi, functionName: 'ownerOf', args: [firstId] }),
    publicClient.readContract({ address: nftAddress, abi: nftAbi, functionName: 'ownerOf', args: [secondId] }),
  ]);
  console.log('────────────────────────────────────────────────────────');
  console.log(`NFT #${firstId} 当前持有者：${owner1}`);
  console.log(`NFT #${secondId} 当前持有者：${owner2}`);
  console.log(`买家地址           ：${buyerAccount.address}`);
  console.log('🎉 演示完成。请查看监听终端打印的 Listed / Bought 日志。');
}

main().catch((error) => {
  console.error(`\n[演示失败] ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
});
