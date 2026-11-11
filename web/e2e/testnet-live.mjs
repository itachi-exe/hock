// Live end-to-end run of /app/testnet/ on Mezo Testnet with a real signing wallet.
// Spends test BTC and needs test MUSD. Usage:
//   DEPLOYER_PRIVATE_KEY=0x... node e2e/testnet-live.mjs [baseUrl] [btcAmount]
// Optional: SHOTS=dir for screenshots, VIDEO=file.webm for a screen recording, CHROME=/path/to/chrome.
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer'); } catch { puppeteer = require('/usr/lib/node_modules/puppeteer'); }

const BASE = process.argv[2] || 'http://127.0.0.1:47311';
const AMOUNT = process.argv[3] || '0.0002';
const RPC = 'https://rpc.test.mezo.org';
const chain = {id: 31611, name: 'Mezo Testnet', nativeCurrency: {name: 'Bitcoin', symbol: 'BTC', decimals: 18}, rpcUrls: {default: {http: [RPC]}}};
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({account, chain, transport: http(RPC)});
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, {recursive: true});
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const sent = [];
let id = 0;

async function rpc(method, params) {
  if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account.address];
  if (method === 'eth_chainId') return '0x' + chain.id.toString(16);
  if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
  if (method === 'eth_sendTransaction') {
    const t = params[0];
    const hash = await wallet.sendTransaction({to: t.to, data: t.data, value: t.value ? BigInt(t.value) : undefined, gas: t.gas ? BigInt(t.gas) : undefined});
    sent.push({to: t.to, hash});
    return hash;
  }
  const r = await fetch(RPC, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: ++id, method, params: params || []})});
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error.message), {code: j.error.code});
  return j.result;
}

const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText || '', sel);
async function click(p, label) {
  const ok = await p.evaluate((l) => {
    const el = [...document.querySelectorAll('button,a')].find((b) => b.offsetParent && !b.disabled && b.textContent.trim().startsWith(l));
    if (el) el.click();
    return Boolean(el);
  }, label);
  if (!ok) throw new Error('no enabled button: ' + label);
}
async function toast(p, re, ms = 200000) {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < ms) {
    const t = await text(p, '.hk-toast');
    if (t !== last) { last = t; console.log(`  ${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(t.replace(/\n/g, ' '))}`); }
    if (re.test(t)) return t;
    if (/revert|error|fail|cancel/i.test(t)) throw new Error('UI reported: ' + t);
    await w(1000);
  }
  throw new Error('timeout waiting for ' + re);
}
const shot = async (p, n) => { if (SHOTS) await p.screenshot({path: `${SHOTS}/${n}.png`}); };
const hero = async (p) => (await text(p, '.hk-hero')).replace(/\n/g, ' ');

const b = await puppeteer.launch({headless: true, args: ['--no-sandbox'], ...(process.env.CHROME ? {executablePath: process.env.CHROME} : {})});
const p = await b.newPage();
await p.setViewport({width: 1280, height: 720});
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.exposeFunction('__hockRpc', rpc);
await p.evaluateOnNewDocument(() => {
  window.ethereum = {isMetaMask: true, request: ({method, params}) => window.__hockRpc(method, params), on() {}, removeListener() {}};
});
let rec;
try {
  await p.goto(BASE + '/app/testnet/', {waitUntil: 'networkidle0'});
  if (process.env.VIDEO) rec = await p.screencast({path: process.env.VIDEO});
  await w(1500); await shot(p, '1-connected');
  if (await p.evaluate(() => [...document.querySelectorAll('button')].some((x) => x.offsetParent && x.textContent.trim() === 'Connect wallet'))) { await click(p, 'Connect wallet'); await w(4000); }

  console.log('DEPOSIT AND BORROW', AMOUNT, 'BTC');
  await p.click('.hk-amt-in input'); await p.keyboard.type(AMOUNT, {delay: 60}); await w(1200); await shot(p, '2-amount');
  await click(p, 'Borrow ');
  await toast(p, /Deposited and borrowed/); await w(5000); await shot(p, '3-borrowed');
  console.log('  hero:', await hero(p));

  console.log('REPAY');
  await click(p, 'Repay'); await w(1200);
  await click(p, 'Max'); await w(1000); await shot(p, '4-repay');
  await click(p, 'Repay ');
  await toast(p, /^Repaid/); await w(5000); await shot(p, '5-repaid');
  console.log('  hero:', await hero(p));

  console.log('EXIT');
  await click(p, 'Exit'); await w(1200); await shot(p, '6-exit');
  await click(p, 'Withdraw everything');
  await toast(p, /returned to your wallet/); await w(5000); await shot(p, '7-exited');
  const h = await hero(p);
  console.log('  hero:', h);
  if (!/\$0\b/.test(h)) throw new Error('position not empty after exit');
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  console.log(`PASS ${sent.length} transactions`);
  for (const s of sent) console.log('  ' + s.hash);
} catch (e) {
  console.log('FAIL', e.message); await shot(p, 'fail'); process.exitCode = 1;
} finally {
  if (rec) await rec.stop();
  await b.close();
}
