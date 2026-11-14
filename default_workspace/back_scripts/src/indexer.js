#!/usr/bin/env node
import 'dotenv/config';
import { getAddress } from 'viem';

import { bankAbi, erc20Abi } from './abi.js';
import { createApiServer } from './api.js';
import { publicClient } from './client.js';
import { config } from './config.js';
import { TransferIndex } from './db.js';

/** 运行时状态，供 REST API 的 /health、/api/status 使用。 */
const state = {
  indexedBlock: null,
  latestBlock: null,
  lastError: null,
  startedAt: new Date().toISOString(),
};

/** 确定要索引的代币：TokenBank demo 直接使用 .env 的 TOKEN_ADDRESS。 */
async function resolveTokenMeta() {
  if (!config.tokenAddress) {
    throw new Error(
      'TOKEN_ADDRESS 未配置：请先运行 TokenBankDemo 部署脚本，并把 CalledToken 地址填入 .env',
    );
  }

  const tokenAddress = config.tokenAddress;
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
  ]);

  return { address: getAddress(tokenAddress), symbol, decimals };
}

/** 首次启动时的起始区块；已有游标时由游标决定。 */
function firstFromBlock(safeLatest) {
  return config.indexFromBlock === 'latest' ? safeLatest : config.indexFromBlock;
}

/** 一次索引循环：从游标后一个区块扫到安全最新区块（单次最多 INDEX_MAX_BLOCK_RANGE 个区块）。 */
async function indexOnce(index, tokenMeta) {
  const latest = await publicClient.getBlockNumber();
  state.latestBlock = Number(latest);

  const safeLatest = latest - BigInt(config.confirmations);
  if (safeLatest < 0n) return;

  const cursor = index.getCursor();
  if (cursor !== null && BigInt(cursor) > latest) {
    console.warn(
      `[警告] 数据库游标 ${cursor} 大于链上最新区块 ${latest}，可能链已重置；` +
        `请删除 ${config.dbPath} 后重启索引服务`,
    );
    return;
  }

  const from = cursor === null ? firstFromBlock(safeLatest) : BigInt(cursor) + 1n;
  if (from > safeLatest) return;

  const rangeEnd = from + BigInt(config.indexMaxBlockRange) - 1n;
  const to = rangeEnd < safeLatest ? rangeEnd : safeLatest;

  // getContractEvents 会按事件 topic 过滤并解码，只返回 Transfer。
  const logs = await publicClient.getContractEvents({
    address: tokenMeta.address,
    abi: erc20Abi,
    eventName: 'Transfer',
    fromBlock: from,
    toBlock: to,
  });

  // 新版 viem 的日志自带 blockTimestamp；旧版本没有时再逐块读取，方便 API 展示。
  const missingTimestampBlocks = [
    ...new Set(logs.filter((log) => log.blockTimestamp === undefined).map((log) => log.blockNumber.toString())),
  ];
  const timestampByBlock = new Map();
  if (missingTimestampBlocks.length > 0) {
    const blocks = await Promise.all(
      missingTimestampBlocks.map((blockNumber) =>
        publicClient.getBlock({ blockNumber: BigInt(blockNumber) }),
      ),
    );
    for (const block of blocks) {
      timestampByBlock.set(block.number.toString(), Number(block.timestamp));
    }
  }

  const rows = logs.map((log) => ({
    txHash: log.transactionHash.toLowerCase(),
    logIndex: Number(log.logIndex),
    blockNumber: Number(log.blockNumber),
    blockTimestamp:
      log.blockTimestamp !== undefined
        ? Number(log.blockTimestamp)
        : (timestampByBlock.get(log.blockNumber.toString()) ?? null),
    fromAddress: log.args.from.toLowerCase(),
    toAddress: log.args.to.toLowerCase(),
    amount: log.args.value.toString(),
  }));

  const inserted = index.saveBatch(rows, to);
  state.indexedBlock = Number(to);

  if (logs.length > 0) {
    console.log(
      `[索引] 区块 ${from} → ${to}：Transfer ${logs.length} 条，新增入库 ${inserted} 条`,
    );
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

async function main() {
  const onChainId = await publicClient.getChainId();
  if (onChainId !== config.chainId) {
    throw new Error(`CHAIN_ID=${config.chainId} 与 RPC 实际链 ID ${onChainId} 不一致`);
  }

  const tokenMeta = await resolveTokenMeta();

  // 可选校验：BANK_ADDRESS 绑定的代币必须是 TOKEN_ADDRESS，避免前端显示错资产。
  if (config.bankAddress) {
    const bankToken = await publicClient.readContract({
      address: config.bankAddress,
      abi: bankAbi,
      functionName: 'token',
    });
    if (getAddress(bankToken) !== tokenMeta.address) {
      throw new Error(
        `BANK_ADDRESS 绑定的代币是 ${getAddress(bankToken)}，` +
          `与 TOKEN_ADDRESS ${tokenMeta.address} 不一致；请检查 .env`,
      );
    }
  }

  const index = new TransferIndex(config.dbPath);
  state.indexedBlock = index.getCursor();

  const server = createApiServer({
    index,
    tokenMeta,
    state,
    bankAddress: config.bankAddress ?? null,
  });
  await listen(server, config.port);

  console.log('════════════════════════════════════════════════════════');
  console.log(' ERC20 Transfer 索引服务已启动');
  console.log(` 链 ID     : ${config.chainId}`);
  console.log(` 代币合约  : ${tokenMeta.address} (${tokenMeta.symbol})`);
  console.log(` 数据库    : ${config.dbPath}`);
  console.log(
    ` 起始游标  : ${state.indexedBlock === null ? config.indexFromBlock : `区块 ${state.indexedBlock}`}`,
  );
  console.log(` TokenBank : ${config.bankAddress ?? '未配置（前端可加 ?bank=0x...）'}`);
  console.log(` REST API  : http://127.0.0.1:${config.port}`);
  console.log(` 前端页面  : http://127.0.0.1:${config.port}/`);
  console.log('   GET /health');
  console.log('   GET /api/status');
  console.log('   GET /api/addresses/:address/transfers?direction=all|in|out&limit=50&offset=0');
  console.log('════════════════════════════════════════════════════════\n');

  let stopped = false;
  let timer;

  const loop = async () => {
    try {
      await indexOnce(index, tokenMeta);
      state.lastError = null;
    } catch (error) {
      state.lastError = error.shortMessage ?? error.message;
      console.error(`[索引错误] ${state.lastError}`);
    }
    if (!stopped) timer = setTimeout(loop, config.indexPollInterval);
  };
  loop();

  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    server.close(() => {
      index.close();
      console.log('\n已停止索引服务。');
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(`[启动失败] ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
});
