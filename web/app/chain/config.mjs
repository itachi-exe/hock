import {parseAbi, defineChain, encodeAbiParameters, keccak256} from 'viem';
import deployed from './deployed.json';

export const mezoTestnet = defineChain({
  id: 31611,
  name: 'Mezo Testnet',
  nativeCurrency: {name: 'Bitcoin', symbol: 'BTC', decimals: 18},
  rpcUrls: {default: {http: ['https://rpc.test.mezo.org']}},
  blockExplorers: {default: {name: 'Mezo Explorer', url: 'https://explorer.test.mezo.org'}},
  testnet: true,
});

export const ADDR = {
  btc: '0x7b7C000000000000000000000000000000000000',
  musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
  priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
  morpho: '0xCe1da828cA15cb1FDAfa84C366A53C8106655a73',
  irm: '0x0c97Fe017628636649ff374aD499529F91167441',
  ...deployed,
};
export const LLTV = 770000000000000000n;
export const FAUCET = 'https://faucet.test.mezo.org/';
export const MUSD_GUIDE = 'https://mezo.org/docs/users/borrow/';
export const isDeployed = Boolean(deployed.vault && deployed.oracle && deployed.router);
export const explorerTx = (h) => `${mezoTestnet.blockExplorers.default.url}/tx/${h}`;

export const marketParams = isDeployed ? {loanToken: ADDR.musd, collateralToken: ADDR.vault, oracle: ADDR.oracle, irm: ADDR.irm, lltv: LLTV} : null;
export const marketId = isDeployed
  ? keccak256(encodeAbiParameters([{type: 'address'}, {type: 'address'}, {type: 'address'}, {type: 'address'}, {type: 'uint256'}], [ADDR.musd, ADDR.vault, ADDR.oracle, ADDR.irm, LLTV]))
  : null;

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
export const feedAbi = parseAbi(['function fetchPrice() view returns (uint256)']);
export const oracleAbi = parseAbi(['function price() view returns (uint256)', 'function fairPrice() view returns (uint256)', 'function totalValue() view returns (uint256)']);
export const vaultAbi = parseAbi(['function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function withdraw(uint256) returns (uint256,uint256)', 'function deposit(uint256 a0,uint256 a1,uint256 minShares) returns (uint256)', 'function approve(address,uint256) returns (bool)']);
export const routerAbi = parseAbi(['function depositAndBorrow(uint256 a0,uint256 a1,uint256 minShares,uint256 borrowAmount) returns (uint256)']);
export const morphoAbi = parseAbi([
  'struct MarketParams {address loanToken; address collateralToken; address oracle; address irm; uint256 lltv;}',
  'function position(bytes32 id,address user) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)',
  'function isAuthorized(address,address) view returns (bool)',
  'function setAuthorization(address,bool)',
  'function repay(MarketParams mp,uint256 assets,uint256 shares,address onBehalf,bytes data) returns (uint256,uint256)',
  'function supplyCollateral(MarketParams mp,uint256 assets,address onBehalf,bytes data)',
  'function borrow(MarketParams mp,uint256 assets,uint256 shares,address onBehalf,address receiver) returns (uint256,uint256)',
  'function withdrawCollateral(MarketParams mp,uint256 assets,address onBehalf,address receiver)',
]);
