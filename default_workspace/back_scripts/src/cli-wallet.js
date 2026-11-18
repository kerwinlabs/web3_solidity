#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  formatGwei,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  zeroAddress,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

import { erc20Abi } from './abi.js';

/**
 * Sepolia 命令行钱包 demo。
 *
 * 命令：
 *   node src/cli-wallet.js createAccount
 *   node src/cli-wallet.js getBalance <address>
 *   node src/cli-wallet.js send <to> <amount>
 *
 * createAccount 会把私钥保存到 data/cli-wallet.json（已 gitignore，权限 0600），
 * send 读取该文件并用它构造、签名、发送 ERC-20 的 EIP-1559 交易。
 */

const BACK_SCRIPTS_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_TOKEN_ADDRESS = '0x3ef32ca45D86cAbE1F0BEfc92f1F8E5788a4de40';
const DEFAULT_SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

/** 账户文件可由 CLI_WALLET_FILE 覆盖，方便测试或指定其他`保存位置。 */
const WALLET_FILE = process.env.CLI_WALLET_FILE?.trim()
  ? path.resolve(process.env.CLI_WALLET_FILE.trim())
  : path.join(BACK_SCRIPTS_DIR, 'data', 'cli-wallet.json');

/**
 * RPC 优先级：
 *   1. SEPOLIA_RPC_URL；
 *   2. 当 CHAIN_ID=11155111 时复用 RPC_URL；
 *   3. 公共 Sepolia 节点。
 */
function resolveRpcUrl() {
  const explicit = process.env.SEPOLIA_RPC_URL?.trim();
  if (explicit) return explicit;

  if (Number(process.env.CHAIN_ID) === sepolia.id && process.env.RPC_URL?.trim()) {
    return process.env.RPC_URL.trim();
  }

  return DEFAULT_SEPOLIA_RPC;
}

function resolveTokenAddress() {
  const raw = (process.env.SEPOLIA_TOKEN_ADDRESS ?? DEFAULT_TOKEN_ADDRESS).trim();
  if (!isAddress(raw)) {
    throw new Error(`SEPOLIA_TOKEN_ADDRESS 不是合法地址: ${raw}`);
  }
  return getAddress(raw);
}

const RPC_URL = resolveRpcUrl();
const TOKEN_ADDRESS = resolveTokenAddress();

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

function usage() {
  console.log(`
Sepolia 命令行钱包

用法:
  node src/cli-wallet.js createAccount [--force]      生成并保存一个新账户
  node src/cli-wallet.js getBalance <address>         查询地址的 ERC-20 与 ETH 余额
  node src/cli-wallet.js send <to> <amount>           用本地账户发送 ERC-20 转账

也可以用 npm:
  npm run wallet -- createAccount
  npm run wallet -- getBalance 0x...
  npm run wallet -- send 0x... 10

环境变量:
  SEPOLIA_RPC_URL        Sepolia RPC，默认 ${DEFAULT_SEPOLIA_RPC}
  SEPOLIA_TOKEN_ADDRESS  覆盖默认代币 ${DEFAULT_TOKEN_ADDRESS}
  CLI_WALLET_FILE        覆盖账户文件路径（默认 data/cli-wallet.json）

当前配置:
  RPC      : ${RPC_URL}
  Token    : ${TOKEN_ADDRESS}
  账户文件 : ${WALLET_FILE}
`);
}

function formatError(error) {
  if (!error) return '未知错误';
  return (
    error.shortMessage ||
    error.details ||
    error.message ||
    String(error)
  );
}

function parseTokenAmount(raw, decimals) {
  const text = String(raw ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error('amount 必须是非负十进制数，例如 10 或 1.5');
  }

  let value;
  try {
    value = parseUnits(text, decimals);
  } catch (_) {
    throw new Error(`amount 的小数位不能超过 ${decimals} 位`);
  }

  if (value <= 0n) throw new Error('amount 必须大于 0');
  return value;
}

async function assertSepolia() {
  const chainId = await publicClient.getChainId();
  if (chainId !== sepolia.id) {
    throw new Error(
      `当前 RPC 的 chainId 是 ${chainId}，不是 Sepolia(${sepolia.id})，请检查 SEPOLIA_RPC_URL`,
    );
  }
}

async function readTokenMeta() {
  const [decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'symbol',
    }),
  ]);

  return { decimals: Number(decimals), symbol };
}

async function readTokenBalance(address) {
  return publicClient.readContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

async function createAccount(force) {
  await fs.mkdir(path.dirname(WALLET_FILE), { recursive: true, mode: 0o700 });

  if (!force) {
    try {
      const existing = JSON.parse(await fs.readFile(WALLET_FILE, 'utf8'));
      if (existing.privateKey) {
        const account = privateKeyToAccount(existing.privateKey);
        console.log('账户已存在，没有覆盖。');
        console.log(`地址      : ${account.address}`);
        console.log(`账户文件  : ${WALLET_FILE}`);
        console.log('如需重新生成，请加 --force（旧账户会被覆盖，且无法恢复）。');
        return;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`读取已有账户文件失败: ${formatError(error)}`);
      }
    }
  }

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const record = {
    address: account.address,
    privateKey,
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(WALLET_FILE, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  await fs.chmod(WALLET_FILE, 0o600);

  console.log('已生成新账户');
  console.log(`地址      : ${account.address}`);
  console.log(`私钥      : ${privateKey}`);
  console.log(`账户文件  : ${WALLET_FILE}`);
  console.log('');
  console.log('请妥善保存私钥；data/cli-wallet.json 已加入 .gitignore，不要提交到仓库。');
}

async function loadAccount() {
  let raw;
  try {
    raw = await fs.readFile(WALLET_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('还没有账户，请先运行 createAccount 生成私钥');
    }
    throw error;
  }

  let record;
  try {
    record = JSON.parse(raw);
  } catch (_) {
    throw new Error(`账户文件格式不正确: ${WALLET_FILE}`);
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(record.privateKey ?? '')) {
    throw new Error(`账户文件中的 privateKey 不合法: ${WALLET_FILE}`);
  }

  const account = privateKeyToAccount(record.privateKey);
  if (record.address && getAddress(record.address) !== account.address) {
    throw new Error('账户文件中的 address 与 privateKey 不匹配');
  }

  return account;
}

async function getBalance(addressArg) {
  if (!addressArg) {
    throw new Error('用法: getBalance <address>');
  }
  if (!isAddress(addressArg)) {
    throw new Error(`address 不是合法地址: ${addressArg}`);
  }

  const address = getAddress(addressArg);
  await assertSepolia();
  const [meta, balance, ethBalance] = await Promise.all([
    readTokenMeta(),
    readTokenBalance(address),
    publicClient.getBalance({ address }),
  ]);

  console.log(`网络      : Sepolia (${sepolia.id})`);
  console.log(`RPC       : ${RPC_URL}`);
  console.log(`Token     : ${TOKEN_ADDRESS} (${meta.symbol}, ${meta.decimals} decimals)`);
  console.log(`地址      : ${address}`);
  console.log(`Token 余额 : ${formatUnits(balance, meta.decimals)} ${meta.symbol}`);
  console.log(`Token 原始 : ${balance.toString()}`);
  console.log(`ETH 余额   : ${formatEther(ethBalance)} ETH`);
  console.log(`ETH 原始   : ${ethBalance.toString()} wei`);
}

async function send(toArg, amountArg) {
  if (!toArg || !amountArg) {
    throw new Error('用法: send <to> <amount>');
  }
  if (!isAddress(toArg)) {
    throw new Error(`to 不是合法地址: ${toArg}`);
  }

  const to = getAddress(toArg);
  if (to === zeroAddress) {
    throw new Error('不能转账到零地址');
  }

  const account = await loadAccount();
  await assertSepolia();
  const meta = await readTokenMeta();
  const amount = parseTokenAmount(amountArg, meta.decimals);

  const tokenBalance = await readTokenBalance(account.address);
  if (tokenBalance < amount) {
    throw new Error(
      `Token 余额不足：当前 ${formatUnits(tokenBalance, meta.decimals)} ${meta.symbol}，` +
        `需要 ${formatUnits(amount, meta.decimals)} ${meta.symbol}`,
    );
  }

  // ERC-20 transfer 的 calldata：selector 0xa9059cbb + to + amount。
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, amount],
  });

  // EIP-1559 交易需要的字段：nonce、gas、maxFeePerGas、maxPriorityFeePerGas。
  const [gas, fees, nonce, nativeBalance] = await Promise.all([
    publicClient.estimateGas({
      account: account.address,
      to: TOKEN_ADDRESS,
      data,
      value: 0n,
    }),
    publicClient.estimateFeesPerGas({ type: 'eip1559' }),
    publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    }),
    publicClient.getBalance({ address: account.address }),
  ]);

  if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined) {
    throw new Error('当前 RPC 不支持 EIP-1559，无法构造 type=2 交易');
  }

  const maxGasCost = gas * fees.maxFeePerGas;
  if (nativeBalance < maxGasCost) {
    throw new Error(
      `Sepolia ETH 不足以支付 gas：最多需要 ${formatEther(maxGasCost)} ETH，` +
        `当前 ${formatEther(nativeBalance)} ETH`,
    );
  }

  const transaction = {
    chainId: sepolia.id,
    type: 'eip1559',
    to: TOKEN_ADDRESS,
    data,
    value: 0n,
    nonce,
    gas,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };

  console.log('准备发送 ERC-20 转账（EIP-1559）');
  console.log(`网络          : Sepolia (${sepolia.id})`);
  console.log(`Token         : ${TOKEN_ADDRESS} (${meta.symbol})`);
  console.log(`From          : ${account.address}`);
  console.log(`To            : ${to}`);
  console.log(`Amount        : ${formatUnits(amount, meta.decimals)} ${meta.symbol}`);
  console.log(`Nonce         : ${nonce}`);
  console.log(`Gas Limit     : ${gas.toString()}`);
  console.log(`Max Fee       : ${formatGwei(fees.maxFeePerGas)} gwei`);
  console.log(`Priority Fee  : ${formatGwei(fees.maxPriorityFeePerGas)} gwei`);
  console.log(`最大 Gas 费用 : ${formatEther(maxGasCost)} ETH`);
  console.log('');

  const serializedTransaction = await account.signTransaction(transaction);
  const hash = await publicClient.sendRawTransaction({ serializedTransaction });

  console.log(`交易已广播: ${hash}`);
  console.log(`浏览器查看: https://sepolia.etherscan.io/tx/${hash}`);
  console.log('等待确认…');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`区块          : ${receipt.blockNumber}`);
  console.log(`状态          : ${receipt.status}`);
  console.log(`Gas Used      : ${receipt.gasUsed.toString()}`);
  if (receipt.effectiveGasPrice !== undefined) {
    console.log(`实际 Gas 价格 : ${formatGwei(receipt.effectiveGasPrice)} gwei`);
  }

  if (receipt.status !== 'success') {
    throw new Error(`交易执行失败（status=${receipt.status}），tx=${hash}`);
  }

  const newBalance = await readTokenBalance(account.address);
  console.log(`转账成功，新余额: ${formatUnits(newBalance, meta.decimals)} ${meta.symbol}`);
}

async function main() {
  const [rawCommand, ...args] = process.argv.slice(2);
  const command = (rawCommand ?? '').toLowerCase();

  switch (command) {
    case 'createaccount':
    case 'create-account':
      await createAccount(args.includes('--force'));
      break;
    case 'getbalance':
    case 'get-balance':
      await getBalance(args[0]);
      break;
    case 'send':
      await send(args[0], args[1]);
      break;
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    default:
      usage();
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`❌ ${formatError(error)}`);
  process.exitCode = 1;
});
