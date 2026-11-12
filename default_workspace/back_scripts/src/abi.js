import { parseAbi } from 'viem';

/**
 * NFTMarket 合约的最小 ABI。
 *
 * 事件签名必须与 forge_project/src/NFTMarket.sol 保持一致：
 *   event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
 *   event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price);
 *   event Delisted(uint256 indexed tokenId, address indexed seller);
 *
 * 监听只需要事件；其余函数供 demo 脚本调用。合约有改动时同步更新这里。
 */
export const marketAbi = parseAbi([
  // 事件
  'event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event Bought(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price)',
  'event Delisted(uint256 indexed tokenId, address indexed seller)',
  // 读取依赖地址
  'function token() view returns (address)',
  'function nft() view returns (address)',
  // demo 需要调用的市场函数
  'function list(uint256 tokenId, uint256 price)',
  'function buyNFT(uint256 tokenId, uint256 amount)',
  'function delist(uint256 tokenId)',
]);

/** 支付代币（CalledToken / ERC20）用到的 ABI。 */
export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferAndCall(address to, uint256 amount, bytes data) returns (bool)',
]);

/** MyERC721 用到的 ABI。 */
export const nftAbi = parseAbi([
  'function _nextTokenId() view returns (uint256)',
  'function mint(address to, string tokenURI) returns (uint256)',
  'function approve(address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]);
