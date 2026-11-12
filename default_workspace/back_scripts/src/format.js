import { formatUnits } from 'viem';

/** 当前时间的可读格式，例如 2026/11/12 22:30:01。 */
export function formatTime(date = new Date()) {
  return date.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 把链上的整型金额格式化为人类可读的数量。
 * @param {bigint | undefined} value 最小单位金额
 * @param {{ decimals?: number, symbol?: string }} meta 代币元信息
 */
export function formatAmount(value, meta = {}) {
  if (value === undefined || value === null) return '-';
  const raw = value.toString();
  if (meta.decimals === undefined) return `${raw}（最小单位）`;

  let pretty;
  try {
    pretty = formatUnits(value, meta.decimals);
  } catch {
    return `${raw}（最小单位）`;
  }
  return meta.symbol ? `${pretty} ${meta.symbol}` : pretty;
}

/** 打印启动时的配置信息。 */
export function printHeader({ marketAddress, tokenMeta, nftAddress, chainId, fromBlock, pollingInterval }) {
  console.log('════════════════════════════════════════════════════════');
  console.log(' NFTMarket 事件监听已启动');
  console.log(` 链 ID     : ${chainId}`);
  console.log(` 市场合约  : ${marketAddress}`);
  console.log(` 支付代币  : ${tokenMeta.address} (${tokenMeta.symbol ?? 'TOKEN'})`);
  console.log(` NFT 合约  : ${nftAddress}`);
  console.log(` 起始区块  : ${fromBlock}`);
  console.log(` 轮询间隔  : ${pollingInterval} ms`);
  console.log('════════════════════════════════════════════════════════');
}

/**
 * 打印一条 NFTMarket 事件，兼容 watchContractEvent 和 parseEventLogs 返回的日志结构。
 * @param {object} log 含 eventName / args / blockNumber / transactionHash / logIndex 的日志
 * @param {{ decimals?: number, symbol?: string }} tokenMeta
 */
export function printEvent(log, tokenMeta = {}) {
  const { eventName, args = {}, blockNumber, transactionHash, logIndex } = log;
  const time = formatTime();
  const tx = transactionHash
    ? `${transactionHash}${logIndex !== undefined ? `#${logIndex}` : ''}`
    : '-';

  switch (eventName) {
    case 'Listed':
      console.log(`[${time}] 🟢 上架 Listed`);
      console.log(`    tokenId : ${args.tokenId}`);
      console.log(`    卖家    : ${args.seller}`);
      console.log(`    价格    : ${formatAmount(args.price, tokenMeta)}`);
      console.log(`    区块    : ${blockNumber}  交易: ${tx}`);
      break;

    case 'Bought':
      console.log(`[${time}] 🟡 成交 Bought`);
      console.log(`    tokenId : ${args.tokenId}`);
      console.log(`    买家    : ${args.buyer}`);
      console.log(`    卖家    : ${args.seller}`);
      console.log(`    价格    : ${formatAmount(args.price, tokenMeta)}`);
      console.log(`    区块    : ${blockNumber}  交易: ${tx}`);
      break;

    case 'Delisted':
      console.log(`[${time}] 🔵 下架 Delisted`);
      console.log(`    tokenId : ${args.tokenId}`);
      console.log(`    卖家    : ${args.seller}`);
      console.log(`    区块    : ${blockNumber}  交易: ${tx}`);
      break;

    default:
      console.log(`[${time}] ⚪ ${eventName ?? '未知事件'}  区块: ${blockNumber}  交易: ${tx}`);
      console.log(`    args    : ${JSON.stringify(args, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  }
}
