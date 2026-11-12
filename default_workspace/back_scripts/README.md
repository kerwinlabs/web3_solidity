# NFTMarket 事件监听（Node + Viem）

后台监听 `NFTMarket` 合约的上架、成交、下架事件，链上发生变化时在终端打印日志。

对应合约：`forge_project/src/NFTMarket.sol`

| 事件       | 触发函数                                  | 含义                       |
| ---------- | ----------------------------------------- | -------------------------- |
| `Listed`   | `list(tokenId, price)`                    | 卖家上架 NFT 并托管到市场  |
| `Bought`   | `buyNFT(tokenId, amount)`                 | 买家先 `approve` 再购买    |
| `Bought`   | `onTokensReceived(...)`（transferAndCall）| 买家通过 `transferAndCall` 直接购买 |
| `Delisted` | `delist(tokenId)`                         | 卖家下架并取回 NFT         |

> 说明：这三个事件在 `NFTMarket.sol:65-72` 中已经声明，`list` / `buyNFT` / `onTokensReceived` / `delist`
> 里也已经 `emit`，因此监听脚本直接可用，无需修改合约。如果以后新增或调整事件，请同步修改
> `src/abi.js` 里的 ABI。

## 目录结构

```
back_scripts/
├── .env.example       # 配置模板
├── package.json
└── src/
    ├── abi.js         # NFTMarket / ERC20 / MyERC721 最小 ABI
    ├── client.js      # 公共 viem client
    ├── config.js      # .env 读取与校验
    ├── demo.js        # 演示脚本：铸造 → 上架 → 两种方式购买
    ├── format.js      # 事件日志格式化
    └── index.js       # 入口：回放历史 + 实时监听
```

## 使用

```bash
cd default_workspace/back_scripts
npm install
cp .env.example .env
# 编辑 .env，至少填 MARKET_ADDRESS；anvil 默认 RPC 无需改
npm start
```

`.env` 字段说明见 `.env.example`，常用的有：

- `RPC_URL`：节点地址，anvil 默认 `http://127.0.0.1:8545`
- `MARKET_ADDRESS`：已部署的 `NFTMarket` 地址
- `CHAIN_ID`：`31337`（anvil）或 `11155111`（Sepolia）
- `FROM_BLOCK`：`latest` 只监听新事件；填区块号则启动时先补发历史事件
- `POLLING_INTERVAL_MS`：HTTP RPC 的轮询间隔

## 测试流程（配合 demo 脚本）

仓库当前 anvil 上已部署：

| 合约        | 地址                                         |
| ----------- | -------------------------------------------- |
| CalledToken | `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6` |
| MyERC721    | `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318` |
| NFTMarket   | `0x610178dA211FEF7D417bC0e6FeD39F05609AD788` |

地址已写入 `.env`。执行：

```bash
# 终端 1：先启动监听
npm start

# 终端 2：铸造 + 上架 + 购买（自动使用 anvil 默认账户 #0 / #1）
npm run demo
```

`demo` 会依次完成：

1. 卖家（账户 #0，CalledToken 部署者）铸造 NFT #1；
2. 卖家 `approve` 市场 → `list` 上架；
3. 买家（账户 #1）MTK 不足时由卖家自动转账；
4. 买家 `approve` → `buyNFT` 购买 NFT #1（`Bought` 事件）；
5. 再铸造 / 上架 NFT #2；
6. 买家 `transferAndCall` 直接购买 NFT #2，触发市场 `onTokensReceived`（同样 `Bought` 事件）。

想在 Remix 里手动操作也可以：`nft.approve` → `market.list` → 买家
`token.approve` → `market.buyNFT`，或 `token.transferAndCall(market, price, abi.encode(tokenId))`。

监听终端应打印类似：

```
════════════════════════════════════════════════════════
 NFTMarket 事件监听已启动
 链 ID     : 31337
 市场合约  : 0xe7f1...
 支付代币  : 0x5FbD... (MTK)
 NFT 合约  : 0xCf7E...
 起始区块  : latest
 轮询间隔  : 4000 ms
════════════════════════════════════════════════════════
历史事件：跳过（只监听区块 12 之后的新事件）
开始监听 Listed / Bought / Delisted 事件（Ctrl+C 停止）…

[2026/11/12 22:30:01] 🟢 上架 Listed
    tokenId : 1
    卖家    : 0x70997970...
    价格    : 100 MTK
    区块    : 13  交易: 0xabc...def#0

[2026/11/12 22:30:15] 🟡 成交 Bought
    tokenId : 1
    买家    : 0x3C44CdDd...
    卖家    : 0x70997970...
    价格    : 100 MTK
    区块    : 14  交易: 0x123...456#0
```

## 实现要点

- 使用 `createPublicClient` + `watchContractEvent`，HTTP RPC 下自动走轮询（`poll: true`）。
- 启动时先校验 RPC 链 ID，再从市场合约读取 `token()` / `nft()` 地址并读取代币精度，
  价格会从最小单位格式化为可读数量。
- `FROM_BLOCK` 为数字时，先用 `getLogs` + `parseEventLogs` 补发历史事件，再从最新区块继续实时监听。
- `SIGINT` / `SIGTERM` 时取消监听并退出。

> Sepolia 等公共 RPC 对 `eth_getLogs` 的区块范围有限制，补历史事件时建议把 `FROM_BLOCK`
> 设置为靠近部署块的数字；anvil 本地链不受影响。
