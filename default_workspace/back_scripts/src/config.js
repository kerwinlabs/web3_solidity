import 'dotenv/config';
import { isAddress } from 'viem';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function readMarketAddress() {
  const value = (process.env.MARKET_ADDRESS ?? '').trim();
  if (!value || !isAddress(value)) {
    throw new Error('环境变量 MARKET_ADDRESS 缺失或不是合法地址，请先复制 .env.example 为 .env 并填写');
  }
  if (value.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('环境变量 MARKET_ADDRESS 仍是示例里的零地址，请填写真实的 NFTMarket 地址');
  }
  return value;
}

function readChainId() {
  const value = Number(process.env.CHAIN_ID ?? 31337);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('环境变量 CHAIN_ID 必须是正整数，例如 anvil 用 31337，Sepolia 用 11155111');
  }
  return value;
}

function readPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数`);
  }
  return value;
}

function readBlockValue(name, fallback = 'latest') {
  const raw = (process.env[name] ?? fallback).trim().toLowerCase();
  if (raw === '' || raw === 'latest') return 'latest';
  if (!/^\d+$/.test(raw)) {
    throw new Error(`环境变量 ${name} 只能是 latest 或非负整数区块号`);
  }
  return BigInt(raw);
}

function readFromBlock() {
  return readBlockValue('FROM_BLOCK');
}

function readNonNegativeInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`环境变量 ${name} 必须是非负整数`);
  }
  return value;
}

function readOptionalAddress(name) {
  const value = (process.env[name] ?? '').trim();
  if (!value) return undefined;
  if (!isAddress(value)) {
    throw new Error(`环境变量 ${name} 不是合法地址`);
  }
  return value;
}

function readTokenDecimalsOverride() {
  const raw = process.env.TOKEN_DECIMALS;
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    throw new Error('环境变量 TOKEN_DECIMALS 必须是 0-255 的整数');
  }
  return value;
}

export const config = {
  /** 节点 RPC 地址 */
  rpcUrl: process.env.RPC_URL?.trim() || 'http://127.0.0.1:8545',
  /** NFTMarket 合约地址 */
  marketAddress: readMarketAddress(),
  /** 链 ID */
  chainId: readChainId(),
  /** 轮询间隔（毫秒） */
  pollingInterval: readPositiveInt('POLLING_INTERVAL_MS', 4000),
  /** 'latest' 或起始区块号 */
  fromBlock: readFromBlock(),
  /** 手动覆盖的代币精度；不填则自动读取 */
  tokenDecimals: readTokenDecimalsOverride(),

  // ===== 索引服务 =====
  /** 要索引的 ERC20 地址；不填则从市场合约的 token() 读取 */
  tokenAddress: readOptionalAddress('TOKEN_ADDRESS'),
  /** SQLite 数据库文件路径 */
  dbPath: (process.env.DB_PATH ?? './data/indexer.db').trim() || './data/indexer.db',
  /** REST API 监听端口 */
  port: readPositiveInt('PORT', 3000),
  /** 索引轮询间隔（毫秒） */
  indexPollInterval: readPositiveInt('INDEX_POLL_INTERVAL_MS', 3000),
  /** 首次索引的起始区块：latest 或区块号；已有游标时从游标继续 */
  indexFromBlock: readBlockValue('INDEX_FROM_BLOCK'),
  /** 单次 getLogs 最多扫描的区块数 */
  indexMaxBlockRange: readPositiveInt('INDEX_MAX_BLOCK_RANGE', 2000),
  /** 等待多少个确认后再索引，anvil 用 0 */
  confirmations: readNonNegativeInt('CONFIRMATIONS', 0),
};
