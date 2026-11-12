import { createPublicClient, defineChain, http } from 'viem';

import { config } from './config.js';

/** 用 .env 里的 CHAIN_ID / RPC_URL 构造 viem 链对象，anvil、Sepolia 都适用。 */
export const chain = defineChain({
  id: config.chainId,
  name: `chain-${config.chainId}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

/** 只读客户端，监听脚本和 demo 脚本共用。 */
export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});
