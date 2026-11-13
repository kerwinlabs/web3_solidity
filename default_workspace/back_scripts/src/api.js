import { createServer } from 'node:http';
import { formatUnits, getAddress, isAddress } from 'viem';

const MAX_LIMIT = 200;

function sendJson(res, status, body) {
  const data = JSON.stringify(body, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

function readIntParam(value, fallback, { min, max }) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * 创建 REST API 服务。
 *
 * 路由：
 *   GET /health
 *   GET /api/status
 *   GET /api/addresses/:address/transfers?direction=all|in|out&limit=&offset=
 *   GET /api/transfers?address=0x...（等价写法）
 */
export function createApiServer({ index, tokenMeta, state }) {
  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      sendJson(res, 500, { error: error.shortMessage ?? error.message });
    });
  });

  async function handle(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: '只支持 GET 请求' });
      return;
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/health') {
      sendJson(res, 200, { ok: true, indexedBlock: state.indexedBlock });
      return;
    }

    if (url.pathname === '/api/status') {
      sendJson(res, 200, {
        token: tokenMeta.address,
        symbol: tokenMeta.symbol,
        decimals: tokenMeta.decimals,
        indexedBlock: state.indexedBlock,
        latestBlock: state.latestBlock,
        lastError: state.lastError,
        startedAt: state.startedAt,
      });
      return;
    }

    const pathMatch = url.pathname.match(/^\/api\/addresses\/([^/]+)\/transfers$/);
    let rawAddress;
    if (pathMatch) {
      rawAddress = decodeURIComponent(pathMatch[1]);
    } else if (url.pathname === '/api/transfers') {
      rawAddress = url.searchParams.get('address');
    } else {
      sendJson(res, 404, { error: '接口不存在' });
      return;
    }

    if (!rawAddress || !isAddress(rawAddress)) {
      sendJson(res, 400, { error: 'address 缺失或不是合法的以太坊地址' });
      return;
    }

    const address = getAddress(rawAddress);
    const normalized = address.toLowerCase();

    const direction = url.searchParams.get('direction') ?? 'all';
    if (!['all', 'in', 'out'].includes(direction)) {
      sendJson(res, 400, { error: 'direction 只能是 all、in 或 out' });
      return;
    }

    const limit = readIntParam(url.searchParams.get('limit'), 50, { min: 1, max: MAX_LIMIT });
    const offset = readIntParam(url.searchParams.get('offset'), 0, {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    if (limit === null) {
      sendJson(res, 400, { error: `limit 必须是 1-${MAX_LIMIT} 的整数` });
      return;
    }
    if (offset === null) {
      sendJson(res, 400, { error: 'offset 必须是非负整数' });
      return;
    }

    const { total, rows } = index.getTransfers({
      address: normalized,
      direction,
      limit,
      offset,
    });

    const transfers = rows.map((row) => {
      const fromNormalized = row.fromAddress.toLowerCase();
      const toNormalized = row.toAddress.toLowerCase();
      const rowDirection =
        fromNormalized === normalized
          ? toNormalized === normalized
            ? 'self'
            : 'out'
          : 'in';

      return {
        txHash: row.txHash,
        logIndex: row.logIndex,
        blockNumber: row.blockNumber,
        blockTimestamp: row.blockTimestamp,
        time: row.blockTimestamp ? new Date(row.blockTimestamp * 1000).toISOString() : null,
        from: getAddress(row.fromAddress),
        to: getAddress(row.toAddress),
        amount: row.amount,
        amountFormatted: `${formatUnits(BigInt(row.amount), tokenMeta.decimals)} ${tokenMeta.symbol}`,
        direction: rowDirection,
      };
    });

    sendJson(res, 200, {
      address,
      direction,
      total,
      limit,
      offset,
      returned: transfers.length,
      transfers,
    });
  }

  return server;
}
