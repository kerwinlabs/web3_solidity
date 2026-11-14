# TokenBank + CalledToken（Node 索引 + MetaMask 前端）

本目录是 **TokenBank + CalledToken** 的完整 demo，不依赖 NFTMarket：

- `npm run indexer`：索引 `CalledToken` 的 ERC-20 `Transfer` 事件到 SQLite，提供 REST API，
  并在 `http://127.0.0.1:3000/` 托管前端页面；
- 前端连接 MetaMask，展示余额 / 存款 / 授权额度，支持普通转账、两种存款方式、取款，
  并展示该地址的转账、存款、取款记录；
- `npm run transfer`：用 anvil 账户互相转账，生成可供索引和页面展示的记录。

对应合约：

- `forge_project/src/CalledToken.sol`：OpenZeppelin ERC20 + `transferAndCall` 回调；
- `forge_project/src/TokenBank.sol`：记录每人存入数量，支持 `deposit` / `withdraw`，
  也支持 CalledToken 的 `transferAndCall` 直接存款。

## 前端可以连接 MetaMask 吗？

可以。页面直接使用 `window.ethereum` + ethers v6 `BrowserProvider`，已经实现：

- 连接 / 断开钱包、`accountsChanged` / `chainChanged` 处理；
- 网络不是 31337 时自动请求切换（或添加本地链）；
- 读取 `balanceOf`、`allowance`、`deposits`、`totalDeposits`；
- 发起 `approve`、`deposit`、`transferAndCall`、`withdraw` 交易并等待确认。

因此**不需要新建独立前端项目**。`frontend/index.html` 是零构建的独立静态页面，
默认由索引服务同源托管；也可以单独部署到任意静态服务器，用 `?api=…` 指向索引服务。

## 目录结构

```
back_scripts/
├── .env.example       # 配置模板
├── package.json
├── data/              # SQLite 数据文件（git 忽略）
├── frontend/
│   └── index.html     # TokenBank 页面（深色 Web3 风格）
└── src/
    ├── abi.js         # ERC20 / TokenBank（以及可选 NFTMarket）ABI
    ├── api.js         # REST API + 前端静态托管
    ├── client.js      # 公共 viem client
    ├── config.js      # .env 读取与校验
    ├── db.js          # SQLite 建表、插入与查询
    ├── indexer.js     # 入口：索引 Transfer + 启动 REST API
    └── transfer-demo.js # 账户之间随机互转 MTK
```

## 启动顺序（从零到页面可用）

```bash
# 1. 启动本地链（另开终端，保持运行）
anvil

# 2. 部署 CalledToken + TokenBank（不涉及 NFTMarket）
cd forge_project
PRIVATE_KEY=<anvil账户私钥> \
  forge script script/TokenBankDemo.s.sol:TokenBankDemoScript \
  --rpc-url http://127.0.0.1:8545 --broadcast
# 终端会打印：
#   TOKEN_ADDRESS=0x...
#   BANK_ADDRESS=0x...

# 3. 配置索引服务 / 前端
cd ../default_workspace/back_scripts
npm install                     # 首次
cp .env.example .env            # 首次
# 编辑 .env：
#   TOKEN_ADDRESS=<第 2 步的 CalledToken>
#   BANK_ADDRESS=<第 2 步的 TokenBank>
#   INDEX_FROM_BLOCK=0

# 4. 启动索引服务 + 前端页面
npm run indexer
# 浏览器打开 http://127.0.0.1:3000/

# 5. 可选：生成账户互转记录，方便查看账本
npm run transfer
```

MetaMask 配置：

- 网络：RPC `http://127.0.0.1:8545`，Chain ID `31337`，货币 `ETH`；
- 导入 anvil 账户（例如 #0）的私钥（公开测试私钥，仅限本地链）：
  `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`；
- 账户 #0 是部署者，默认持有 1,000,000 MTK。想在页面用其他账户存款，可先跑
  `npm run transfer`，它会从 #0 给 #1 ~ #3 各补到 100 MTK，也可以在页面的
  `Transfer` Tab 里直接给另一个账户转账。

> anvil 重置后，链上地址和区块号都会变：重新部署并把新地址写入 `.env`，
> 删除 `data/indexer.db` 后重启索引服务。

## 部署脚本

### TokenBankDemo（推荐，TokenBank + CalledToken）

`forge_project/script/TokenBankDemo.s.sol` 只依赖 `CalledToken` 和 `TokenBank`：

```bash
cd forge_project
PRIVATE_KEY=<私钥> \
  forge script script/TokenBankDemo.s.sol:TokenBankDemoScript \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

行为：

1. 部署 `CalledToken("Bank Token", "MTK", 1_000_000e18)`，初始供应量给部署者；
2. 部署 `TokenBank` 并绑定该代币；
3. 地址写入 `deployments/CalledToken_<chainId>.json`、`deployments/TokenBank_<chainId>.json`。

### TokenBank（绑定已有代币）

如果已经有一个 ERC-20（例如之前部署的 CalledToken），可用
`forge_project/script/TokenBank.s.sol` 只部署 TokenBank：

```bash
cd forge_project
TOKEN_ADDRESS=0x... PRIVATE_KEY=<私钥> \
  forge script script/TokenBank.s.sol:TokenBankScript \
  --rpc-url http://127.0.0.1:8545 --broadcast
```

不传 `TOKEN_ADDRESS` 时，脚本会读取 `deployments/CalledToken_<chainId>.json`。

## TokenBank 前端

前端代码在 `frontend/index.html`，按 `design/erc20_token_deposit_portal/` 的深色 DeFi
设计实现：

- 顶部指标卡：TokenBank TVL、我的存款、钱包余额、授权额度；
- 中间操作台：`Deposit` / `Withdraw` / `Transfer` 三个 Tab，支持 25% / 50% / 75% / MAX；
- 存款支持两种方式，可在 `Deposit Mode / 存款方式` 切换：
  - **两步授权**：`Step 1 授权`（approve，可选精确金额或无限授权）→ `Step 2 存款`（TokenBank.deposit）；
  - **一步快速**：直接调用 `CalledToken.transferAndCall`，转账与 TokenBank 记账在同一笔交易完成，无需 approve
    （仅适用于 CalledToken；普通 ERC-20 没有该函数）；
- 取款直接校验已存入数量，按 checks-effects-interactions 执行；
- 转账 Tab 填写接收地址和金额，直接调用 `CalledToken.transfer`；
- 所有操作确认后自动刷新余额并补拉索引记录；
- 下方账本：All / Deposits / Withdrawals / Transfers 筛选、Tx Hash / 地址搜索、分页、刷新；
- 页面每 5 秒刷新链上余额和索引记录，交易确认后 2.5 / 6 秒补拉记录。

地址来源：

- `TOKEN_ADDRESS` / `BANK_ADDRESS` 从 `.env` 进入 `/api/status`，页面自动读取；
- `BANK_ADDRESS` 留空时顶部会提示，也可用 `?bank=0x…` 临时覆盖；
- `?token=0x…` 覆盖代币，`?api=http://127.0.0.1:3000` 指向独立部署的 API；
- ethers v6 通过 jsDelivr 加载，需要联网。

> 如果以后要做多页面、路由、组件化、WalletConnect 或 TypeScript，再拆成 Vite/React
> 工程更合适；当前 demo 使用单文件静态页面，零构建、开箱即用。

## ERC20 转账索引服务

```bash
npm run indexer
```

索引器会：

- 从 `TOKEN_ADDRESS` 索引 ERC-20 `Transfer` 事件（不再从 NFTMarket 读取）；
- 首次从 `INDEX_FROM_BLOCK` 开始，之后每 3 秒轮询新区块；
- 已索引区块保存在 SQLite 的 `sync_state` 表，重启后继续；
- 启动时可选校验 `BANK_ADDRESS.token()` 是否等于 `TOKEN_ADDRESS`，避免配错；
- 同时提供 REST API，并托管 `frontend/` 静态文件。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回当前索引区块 |
| GET | `/api/status` | 代币信息、TokenBank 地址与索引进度 |
| GET | `/api/addresses/:address/transfers` | 查询某个地址的转账记录 |
| GET | `/api/transfers?address=0x...` | 同上（查询参数写法） |

查询参数：

- `direction`：`all`（默认）、`in`、`out`
- `limit`：默认 50，最大 200
- `offset`：默认 0

```bash
curl 'http://127.0.0.1:3000/api/addresses/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266/transfers'
```

响应中的记录包含 `txHash`、`blockNumber`、`time`、`from`、`to`、`amount`、
`amountFormatted`、`direction`。前端会根据 `from` / `to` 是否等于 TokenBank 地址，
把记录标记为 Deposit / Withdrawal / Transfer。

### 数据表

- `transfers`：每条 `Transfer` 一行，`(tx_hash, log_index)` 唯一，金额用十进制字符串保存；
- `sync_state`：保存已索引区块号，用于断点续传。

### 注意

- 使用 Node 内置 `node:sqlite`（需要 Node >= 22.5），无需额外数据库依赖；
- anvil 重置后，删除 `data/indexer.db` 再重启；
- 想让索引器抓到 `npm run transfer` 的记录：先启动索引器再转账，或保持
  `INDEX_FROM_BLOCK=0` 并在转账后重新索引。

## 账户互转模拟

```bash
npm run transfer
```

- 默认用 anvil 助记词派生 #0 ~ #3，其中 #0 是 CalledToken 部署者；
- 先给 #1 ~ #3 各补到 `TRANSFER_FUND_AMOUNT`（默认 100 MTK）；
- 之后随机互转 `TRANSFER_ROUNDS` 轮，每笔 `TRANSFER_AMOUNT`（默认 10 MTK）；
- 每轮重新读取余额，余额不足的账户不会被选为发送方；
- 结束后打印每个账户余额，可在页面账本和 API 中查看所有 Transfer。

相关环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TRANSFER_ACCOUNT_COUNT` | 4 | 参与账户数（默认助记词最多 10 个） |
| `TRANSFER_ROUNDS` | 10 | 随机互转轮数 |
| `TRANSFER_AMOUNT` | 10 | 每笔转账的 MTK 数量 |
| `TRANSFER_FUND_AMOUNT` | 100 | 给账户 #1~#N 准备的初始余额 |
| `TRANSFER_DELAY_MS` | 1500 | 每笔交易间隔（毫秒） |
| `TRANSFER_PRIVATE_KEYS` | 空 | 逗号分隔私钥；非 anvil 链或自定义账户时使用 |
| `ANVIL_MNEMONIC` | anvil 默认助记词 | 自定义 anvil 助记词时覆盖 |

## 附：NFTMarket 监听（与本 demo 独立）

如果仍想运行之前的 NFTMarket 事件监听：

```bash
# 部署 NFTMarket（另见 forge_project/script/NFTMarket.s.sol）
cd forge_project
PRIVATE_KEY=<私钥> forge script script/NFTMarket.s.sol:NFTMarketScript \
  --rpc-url http://127.0.0.1:8545 --broadcast

# 在 .env 中填 MARKET_ADDRESS，然后：
cd ../default_workspace/back_scripts
npm start     # 监听 Listed / Bought / Delisted
npm run demo  # 铸造 → 上架 → 两种方式购买
```

`npm start` / `npm run demo` 需要 `MARKET_ADDRESS`；TokenBank 的
`npm run indexer` / `npm run transfer` 不需要。
