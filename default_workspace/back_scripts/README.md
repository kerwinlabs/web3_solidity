# NFTMarket 事件监听 & ERC20 转账索引（Node + Viem）

- `npm start`：后台监听 `NFTMarket` 的上架、成交、下架事件，链上变化时打印日志；
- `npm run indexer`：索引 `CalledToken` 的 ERC20 `Transfer` 事件到 SQLite，并提供 REST API
  查询某个地址的转账记录。

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
├── data/              # SQLite 数据文件（git 忽略）
└── src/
    ├── abi.js         # NFTMarket / ERC20 / MyERC721 最小 ABI
    ├── api.js         # 索引服务的 REST API
    ├── client.js      # 公共 viem client
    ├── config.js      # .env 读取与校验
    ├── db.js          # SQLite 建表、插入与查询
    ├── demo.js        # 演示脚本：铸造 → 上架 → 两种方式购买
    ├── format.js      # 事件日志格式化
    ├── indexer.js     # 入口：索引 Transfer + 启动 REST API
    ├── transfer-demo.js # 账户之间随机互转 MTK
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
- `TOKEN_ADDRESS`、`DB_PATH`、`INDEX_FROM_BLOCK`、`PORT`：索引服务配置，见下方说明

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

## 模拟账户互转

```bash
npm run transfer
```

用途：生成一批 MTK 转账，配合索引服务观察入库和查询效果。

- 默认用 anvil 默认助记词派生 4 个账户（#0 ~ #3），其中账户 #0 是 CalledToken 部署者；
- 先给其他账户各补到 `TRANSFER_FUND_AMOUNT`（默认 100 MTK，由账户 #0 转出）；
- 之后随机选择两个不同账户互转，共 `TRANSFER_ROUNDS` 轮，每笔 `TRANSFER_AMOUNT`（默认 10 MTK）；
- 每轮都会重新读取余额，余额不足的账户不会被选为发送方；
- 结束后打印每个账户的最终余额。

推荐顺序：

```bash
# 终端 1：启动索引服务
npm run indexer

# 终端 2：生成转账
npm run transfer
```

即使先跑了 transfer 再启动索引器也没关系：`INDEX_FROM_BLOCK=14` 会补扫部署以来的所有
Transfer。之后用 `/api/addresses/:address/transfers` 查询任意参与账户即可看到这些记录。

相关环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TRANSFER_ACCOUNT_COUNT` | 4 | 参与账户数（默认助记词最多派生 10 个） |
| `TRANSFER_ROUNDS` | 10 | 随机互转轮数 |
| `TRANSFER_AMOUNT` | 10 | 每笔转账的 MTK 数量 |
| `TRANSFER_FUND_AMOUNT` | 100 | 给账户 #1~#N 准备的初始余额 |
| `TRANSFER_DELAY_MS` | 1500 | 每笔交易间隔（毫秒） |
| `TRANSFER_PRIVATE_KEYS` | 空 | 逗号分隔私钥；非 anvil 链或自定义账户时使用 |
| `ANVIL_MNEMONIC` | anvil 默认助记词 | 自定义 anvil 助记词时覆盖 |

## ERC20 转账索引服务

### 启动

```bash
npm run indexer
```

索引器会：

- 从 `TOKEN_ADDRESS` 索引 ERC20 `Transfer` 事件（留空则从 `MARKET_ADDRESS` 的 `token()` 读取）；
- 首次从 `INDEX_FROM_BLOCK` 开始（当前 anvil 上 CalledToken 部署于区块 14），之后每
  `INDEX_POLL_INTERVAL_MS` 毫秒轮询新事件并写入 SQLite；
- 把已索引到的区块号保存在 `sync_state` 表，重启后从下一个区块继续；
- 同时启动 REST API，默认 `http://127.0.0.1:3000`。

### 接口

| 方法 | 路径                                    | 说明                         |
| ---- | --------------------------------------- | ---------------------------- |
| GET  | `/health`                               | 健康检查，返回当前索引区块   |
| GET  | `/api/status`                           | 代币信息与索引进度           |
| GET  | `/api/addresses/:address/transfers`     | 查询某个地址的转账记录       |
| GET  | `/api/transfers?address=0x...`          | 同上（查询参数写法）         |

查询参数：

- `direction`：`all`（默认，转入 + 转出）、`in`（只转出到该地址）、`out`（只从该地址转出）
- `limit`：默认 50，最大 200
- `offset`：默认 0

```bash
curl 'http://127.0.0.1:3000/api/addresses/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/transfers'
curl 'http://127.0.0.1:3000/api/addresses/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/transfers?direction=out&limit=10'
```

响应示例：

```json
{
  "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "direction": "all",
  "total": 3,
  "limit": 50,
  "offset": 0,
  "returned": 3,
  "transfers": [
    {
      "txHash": "0x...",
      "logIndex": 0,
      "blockNumber": 18,
      "blockTimestamp": 1763000000,
      "time": "2026-11-13T00:00:00.000Z",
      "from": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "amount": "100000000000000000000",
      "amountFormatted": "100 MTK",
      "direction": "out"
    }
  ]
}
```

### 数据表

- `transfers`：每条 `Transfer` 一行，`(tx_hash, log_index)` 唯一，`amount` 用十进制字符串保存，
  避免 uint256 精度丢失；`from_address` / `to_address` 建了索引。
- `sync_state`：保存已索引到的区块号，用于断点续传。

### 注意

- 使用 Node 内置的 `node:sqlite`（需要 Node >= 22.5，本项目是 Node 24），无需额外的数据库依赖。
- anvil 重启/重置后链上区块会回到 0，数据库游标可能大于最新区块；删除 `data/indexer.db`
  后重启即可重新索引。
- 想让索引器抓到 `npm run demo` 产生的转账：先启动索引器再运行 demo；如果 demo 已经跑过，
  删除旧数据库并确保 `INDEX_FROM_BLOCK` 覆盖 deploy 区块（当前 anvil 为 14）即可重扫。

## 实现要点

- 使用 `createPublicClient` + `watchContractEvent`，HTTP RPC 下自动走轮询（`poll: true`）。
- 启动时先校验 RPC 链 ID，再从市场合约读取 `token()` / `nft()` 地址并读取代币精度，
  价格会从最小单位格式化为可读数量。
- `FROM_BLOCK` 为数字时，先用 `getLogs` + `parseEventLogs` 补发历史事件，再从最新区块继续实时监听。
- `SIGINT` / `SIGTERM` 时取消监听并退出。

> Sepolia 等公共 RPC 对 `eth_getLogs` 的区块范围有限制，补历史事件时建议把 `FROM_BLOCK`
> 设置为靠近部署块的数字；anvil 本地链不受影响。
