#!/usr/bin/env node
import 'dotenv/config';
import { createWalletClient, formatUnits, http, parseEther } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { erc20Abi, marketAbi } from './abi.js';
import { chain, publicClient } from './client.js';
import { config } from './config.js';

// anvil 默认助记词（BIP39）。anvil 不带 --mnemonic 启动时用的就是这一串。
// mnemonicToAccount 会按 BIP44 路径 m/44'/60'/0'/0/{addressIndex} 派生出私钥和地址，
// 结果与 anvil 启动日志里的 Account #0 ~ #9 完全一致。
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

function readInt(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`环境变量 ${name} 必须是 ${min}-${max} 的整数`);
  }
  return value;
}

/**
 * 载入参与转账的账户：
 *   1. 优先使用 TRANSFER_PRIVATE_KEYS（逗号分隔的私钥）；
 *   2. 否则在 anvil(31337) 上用默认助记词派生，数量由 TRANSFER_ACCOUNT_COUNT 决定。
 */
function loadAccounts(count) {
  // 方式一：显式私钥。数组顺序就是账户编号：#0 是第一个私钥，#1 是第二个……
  const rawKeys = (process.env.TRANSFER_PRIVATE_KEYS ?? '').trim();
  if (rawKeys) {
    const keys = rawKeys
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);
    if (keys.length < 2) {
      throw new Error('TRANSFER_PRIVATE_KEYS 至少需要两个私钥');
    }
    return keys.map((key, index) => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
        throw new Error(`TRANSFER_PRIVATE_KEYS 中第 ${index + 1} 个私钥格式不合法`);
      }
      return privateKeyToAccount(key);
    });
  }

  // 方式二：anvil 默认助记词派生。只允许本地 anvil，避免在真实网络上用公开测试私钥。
  if (config.chainId !== 31337) {
    throw new Error('非 anvil(31337) 链必须显式设置 TRANSFER_PRIVATE_KEYS，禁止使用默认测试助记词');
  }

  const mnemonic = (process.env.ANVIL_MNEMONIC ?? ANVIL_MNEMONIC).trim();
  const accounts = [];
  // addressIndex: 0 → anvil #0，1 → anvil #1 …… 依次派生 count 个账户。
  for (let i = 0; i < count; i++) {
    accounts.push(mnemonicToAccount(mnemonic, { addressIndex: i }));
  }
  return accounts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function formatTokenAmount(value, token) {
  return `${formatUnits(value, token.decimals)} ${token.symbol}`;
}

async function main() {
  // 参与账户数：默认 4，即派生 anvil #0 ~ #3；上限 10（anvil 默认只给前 10 个账户发 ETH）。
  const accountCount = readInt('TRANSFER_ACCOUNT_COUNT', 4, { min: 2, max: 10 });
  // 随机互转轮数。
  const rounds = readInt('TRANSFER_ROUNDS', 10, { min: 1, max: 1000 });
  // 每笔交易之间的等待时间，便于监听/索引服务逐条看到事件。
  const delay = readInt('TRANSFER_DELAY_MS', 1500, { min: 0, max: 600000 });
  // 每笔转账金额（MTK）。
  const amount = parseEther(process.env.TRANSFER_AMOUNT ?? '10');
  // 每个非 #0 账户的目标初始余额；低于它才补差额。
  const fundTarget = parseEther(process.env.TRANSFER_FUND_AMOUNT ?? '100');

  if (amount <= 0n) throw new Error('TRANSFER_AMOUNT 必须大于 0');

  const onChainId = await publicClient.getChainId();
  if (onChainId !== config.chainId) {
    throw new Error(`CHAIN_ID=${config.chainId} 与 RPC 实际链 ID ${onChainId} 不一致`);
  }

  const accounts = loadAccounts(accountCount);
  const wallets = accounts.map((account) =>
    createWalletClient({ account, chain, transport: http(config.rpcUrl) }),
  );

  // 代币地址：优先 .env 的 TOKEN_ADDRESS，否则调用 NFTMarket.token() 读取。
  const tokenAddress =
    config.tokenAddress ??
    (await publicClient.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: 'token',
    }));
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const token = { address: tokenAddress, symbol, decimals };

  /** 读取某个地址的 MTK 余额。 */
  const balanceOf = (address) =>
    publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });

  /**
   * 用第 fromIndex 个账户发起一笔 ERC20 transfer，等交易上链后打印结果。
   * 这里调用 CalledToken.transfer(to, value)，每次调用都会产生一个 Transfer 事件。
   */
  async function sendTransfer(label, fromIndex, toIndex, value) {
    const hash = await wallets[fromIndex].writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [accounts[toIndex].address, value],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`${label} 转账失败，交易哈希：${hash}`);
    }

    console.log(
      `${label} ${short(accounts[fromIndex].address)} → ${short(accounts[toIndex].address)}  ` +
        `${formatTokenAmount(value, token)}  区块 ${receipt.blockNumber}`,
    );
    if (delay > 0) await sleep(delay);
  }

  console.log('════════════════════════════════════════════════════════');
  console.log(' MTK 账户互转模拟');
  console.log(` 代币    : ${tokenAddress} (${token.symbol})`);
  console.log(` 账户数  : ${accounts.length}`);
  console.log(` 转账轮数: ${rounds}，每笔 ${formatTokenAmount(amount, token)}`);
  accounts.forEach((account, index) => {
    console.log(` #${index} ${account.address}`);
  });
  console.log('════════════════════════════════════════════════════════\n');

  // 1. 用账户 #0 给 #1 ~ #(N-1) 准备启动余额。
  //    #0 是 CalledToken 部署者，部署时的 1,000,000 MTK 全部在它名下；
  //    严格说只要 #0 的 MTK 余额足够，不要求它一定是部署者。
  //    一次性读取所有余额，避免循环里反复请求 RPC。
  const balances = await Promise.all(accounts.map((account) => balanceOf(account.address)));
  const topUps = [];
  for (let i = 1; i < accounts.length; i++) {
    // 只补差额：例如目标 100、当前 80，就只转 20；重复运行不会越充越多。
    if (balances[i] < fundTarget) {
      topUps.push({ index: i, value: fundTarget - balances[i] });
    }
  }
  const totalTopUp = topUps.reduce((sum, item) => sum + item.value, 0n);

  if (totalTopUp > 0n) {
    // #0 除了支付所有充值，自己还要参与后续互转，因此额外预留一笔 amount。
    if (balances[0] < totalTopUp + amount) {
      throw new Error(
        `账户 #0 的 ${token.symbol} 余额不足（需要 ${formatTokenAmount(totalTopUp + amount, token)}，` +
          `实际 ${formatTokenAmount(balances[0], token)}）。请确认账户 #0 是代币部署者`,
      );
    }
    console.log(`准备资金：从账户 #0 给 ${topUps.length} 个账户充值`);
    for (const item of topUps) {
      await sendTransfer('[充值]', 0, item.index, item.value);
    }
    console.log('');
  } else {
    console.log('所有账户余额已充足，跳过充值\n');
  }

  // 2. 随机互转。
  //    每一轮都重新读取余额，过滤出余额 >= 单笔金额的账户作为候选发送方；
  //    再从剩下的账户里随机挑一个接收方，保证发送方和接收方不是同一个地址。
  let success = 0;
  for (let round = 1; round <= rounds; round++) {
    const current = await Promise.all(accounts.map((account) => balanceOf(account.address)));
    const senders = current
      .map((balance, index) => ({ balance, index }))
      .filter((item) => item.balance >= amount)
      .map((item) => item.index);

    if (senders.length === 0) {
      console.warn('所有账户余额都不足，停止模拟');
      break;
    }

    // 随机发送方：从余额足够的账户中选。
    const fromIndex = senders[Math.floor(Math.random() * senders.length)];
    // 随机接收方：排除发送方自己，避免自己转给自己。
    const receivers = accounts.map((_, index) => index).filter((index) => index !== fromIndex);
    const toIndex = receivers[Math.floor(Math.random() * receivers.length)];

    await sendTransfer(`[${round}/${rounds}]`, fromIndex, toIndex, amount);
    success++;
  }

  // 3. 打印最终余额，方便与索引服务里的转账记录核对。
  const finalBalances = await Promise.all(accounts.map((account) => balanceOf(account.address)));
  console.log('\n────────────────────────────────────────────────────────');
  accounts.forEach((account, index) => {
    console.log(`#${index} ${account.address}  ${formatTokenAmount(finalBalances[index], token)}`);
  });
  console.log(`🎉 模拟完成：成功转账 ${success} 笔，共 ${success + topUps.length} 条 Transfer 事件。`);
  console.log('   请到索引服务查询：GET /api/addresses/<地址>/transfers');
}

main().catch((error) => {
  console.error(`\n[模拟失败] ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
});
