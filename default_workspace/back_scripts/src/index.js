#!/usr/bin/env node
import { parseEventLogs } from 'viem';

import { erc20Abi, marketAbi } from './abi.js';
import { publicClient as client } from './client.js';
import { config } from './config.js';
import { printEvent, printHeader } from './format.js';

/** 读取支付代币的 symbol / decimals，读取失败时只打印最小单位。 */
async function readTokenMeta(tokenAddress) {
  if (config.tokenDecimals !== undefined) {
    let symbol;
    try {
      symbol = await client.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      });
    } catch {
      symbol = 'TOKEN';
    }
    return { address: tokenAddress, symbol, decimals: config.tokenDecimals };
  }

  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    return { address: tokenAddress, symbol, decimals };
  } catch (error) {
    console.warn(
      `[警告] 读取支付代币元信息失败，价格将按最小单位显示：${error.shortMessage ?? error.message}`,
    );
    return { address: tokenAddress, symbol: 'TOKEN', decimals: undefined };
  }
}

/**
 * 确定监听起点，并可选地补发历史事件。
 * @returns {Promise<bigint>} watchContractEvent 的 fromBlock
 */
async function prepareStartBlock(tokenMeta) {
  const latest = await client.getBlockNumber();

  if (config.fromBlock === 'latest') {
    console.log(`历史事件：跳过（只监听区块 ${latest + 1n} 之后的新事件）`);
    return latest + 1n;
  }

  const from = config.fromBlock;
  if (from > latest) {
    console.warn(`FROM_BLOCK=${from} 大于当前最新区块 ${latest}，改为从下一个新块开始监听`);
    return latest + 1n;
  }

  console.log(`回放历史事件：区块 ${from} → ${latest}`);
  const rawLogs = await client.getLogs({
    address: config.marketAddress,
    fromBlock: from,
    toBlock: latest,
  });
  const logs = parseEventLogs({ abi: marketAbi, logs: rawLogs });

  for (const log of logs) printEvent(log, tokenMeta);
  console.log(`历史事件共 ${logs.length} 条`);

  return latest + 1n;
}

async function main() {
  // 1. 先确认 RPC 可用，且链 ID 与配置一致，避免监听错链。
  let onChainId;
  try {
    onChainId = await client.getChainId();
  } catch (error) {
    throw new Error(`无法连接 RPC ${config.rpcUrl}：${error.shortMessage ?? error.message}`);
  }
  if (onChainId !== config.chainId) {
    throw new Error(`CHAIN_ID=${config.chainId} 与 RPC 实际链 ID ${onChainId} 不一致，请检查配置`);
  }
  if (!config.marketAddress) {
    throw new Error(
      'MARKET_ADDRESS 未配置。npm start 仅用于监听 NFTMarket；TokenBank demo 请用 npm run indexer',
    );
  }

  // 2. 从市场合约读取支付代币和 NFT 地址，同时校验地址上确实有合约。
  const [tokenAddress, nftAddress] = await Promise.all([
    client.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: 'token',
    }),
    client.readContract({
      address: config.marketAddress,
      abi: marketAbi,
      functionName: 'nft',
    }),
  ]);
  const tokenMeta = await readTokenMeta(tokenAddress);

  printHeader({
    marketAddress: config.marketAddress,
    tokenMeta,
    nftAddress,
    chainId: config.chainId,
    fromBlock: config.fromBlock === 'latest' ? 'latest' : config.fromBlock.toString(),
    pollingInterval: config.pollingInterval,
  });

  // 3. 可选地回放历史事件，然后从最新区块开始实时监听。
  const startBlock = await prepareStartBlock(tokenMeta);
  console.log(`开始监听 Listed / Bought / Delisted 事件（Ctrl+C 停止）…\n`);

  const unwatch = client.watchContractEvent({
    address: config.marketAddress,
    abi: marketAbi,
    // HTTP RPC 不支持订阅，使用轮询模式读取新日志。
    poll: true,
    pollingInterval: config.pollingInterval,
    fromBlock: startBlock,
    onLogs: (logs) => {
      for (const log of logs) printEvent(log, tokenMeta);
    },
    onError: (error) => {
      console.error(`[监听错误] ${error.shortMessage ?? error.message}`);
    },
  });

  const shutdown = () => {
    unwatch();
    console.log('\n已停止监听。');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(`[启动失败] ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
});
