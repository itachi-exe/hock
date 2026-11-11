'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {createPublicClient, createWalletClient, custom, formatUnits, http, parseUnits, maxUint256} from 'viem';
import {ADDR, LLTV, erc20Abi, explorerTx, feedAbi, isDeployed, marketId, marketParams, mezoTestnet, morphoAbi, oracleAbi, routerAbi, vaultAbi} from '../chain/config.mjs';

const Ctx = createContext(null);
const pub = createPublicClient({chain: mezoTestnet, transport: http()});
const f = (v) => Number(formatUnits(v ?? 0n, 18));
const GAS_FLOOR = 0.0000002; // BTC kept aside for gas

export function ChainProvider({children}) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [hasWallet, setHasWallet] = useState(true);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const alive = useRef(true);
  const seq = useRef(0); // newest read wins, so a slow no-wallet read cannot overwrite a wallet read
  useEffect(() => () => { alive.current = false; }, []);

  const eth = () => (typeof window !== 'undefined' ? window.ethereum : null);

  const read = useCallback(async (who) => {
    const mine = ++seq.current;
    try {
      const base = await Promise.all([
        pub.readContract({address: ADDR.priceFeed, abi: feedAbi, functionName: 'fetchPrice'}),
        pub.getBlockNumber(),
        who ? pub.readContract({address: ADDR.btc, abi: erc20Abi, functionName: 'balanceOf', args: [who]}) : 0n,
        who ? pub.readContract({address: ADDR.musd, abi: erc20Abi, functionName: 'balanceOf', args: [who]}) : 0n,
      ]);
      const out = {btcPrice: f(base[0]), block: Number(base[1]), btc: f(base[2]), musd: f(base[3]), shares: 0, collateral: 0, debt: 0, collateralValue: 0, health: null, liqPrice: null, sharePrice: 0};
      if (isDeployed) {
        const [px, tv, ts, pos, mk, sh] = await Promise.all([
          pub.readContract({address: ADDR.oracle, abi: oracleAbi, functionName: 'price'}).catch(() => null),
          pub.readContract({address: ADDR.oracle, abi: oracleAbi, functionName: 'totalValue'}).catch(() => 0n),
          pub.readContract({address: ADDR.vault, abi: vaultAbi, functionName: 'totalSupply'}),
          who ? pub.readContract({address: ADDR.morpho, abi: morphoAbi, functionName: 'position', args: [marketId, who]}) : [0n, 0n, 0n],
          pub.readContract({address: ADDR.morpho, abi: morphoAbi, functionName: 'market', args: [marketId]}),
          who ? pub.readContract({address: ADDR.vault, abi: vaultAbi, functionName: 'balanceOf', args: [who]}) : 0n,
        ]);
        out.oracleLive = px !== null;
        out.shares = f(sh);
        out.borrowShares = pos[1]; out.collateralRaw = pos[2]; out.sharesRaw = sh;
        out.collateral = f(pos[2]);
        out.debt = mk[3] > 0n ? f((pos[1] * mk[2] + mk[3] - 1n) / mk[3]) : 0;
        out.sharePrice = ts > 0n ? f(tv) / f(ts) : 0;
        out.collateralValue = out.collateral * out.sharePrice;
        if (out.debt > 0.01 && px) {
          const maxBorrow = f(pos[2] * px / 10n ** 36n * LLTV / 10n ** 18n);
          out.health = maxBorrow / out.debt;
          out.liqPrice = out.btcPrice / out.health;
        }
      }
      if (alive.current && mine === seq.current) setData(out);
      return out;
    } catch (e) {
      if (alive.current && mine === seq.current) setData((d) => d ?? {error: String(e.shortMessage || e.message || e)});
      return null;
    }
  }, []);

  useEffect(() => {
    const e = eth();
    if (!e) { setHasWallet(false); read(null); return; }
    e.request({method: 'eth_accounts'}).then((a) => { if (a[0]) setAccount(a[0]); }).catch(() => {});
    e.request({method: 'eth_chainId'}).then((c) => setChainId(parseInt(c, 16))).catch(() => {});
    const acc = (a) => setAccount(a[0] || null);
    const chn = (c) => setChainId(parseInt(c, 16));
    e.on?.('accountsChanged', acc); e.on?.('chainChanged', chn);
    return () => { e.removeListener?.('accountsChanged', acc); e.removeListener?.('chainChanged', chn); };
  }, [read]);

  useEffect(() => {
    read(account);
    const t = setInterval(() => read(account), 12000);
    return () => clearInterval(t);
  }, [account, read]);

  const say = (kind, text, hash) => setNote({kind, text, hash, id: Date.now()});

  const switchChain = useCallback(async () => {
    const e = eth();
    const hex = '0x' + mezoTestnet.id.toString(16);
    try { await e.request({method: 'wallet_switchEthereumChain', params: [{chainId: hex}]}); }
    catch (err) {
      if (err?.code === 4902 || /unrecognized|not added|Unrecognized/i.test(err?.message || '')) {
        await e.request({method: 'wallet_addEthereumChain', params: [{chainId: hex, chainName: 'Mezo Testnet', nativeCurrency: mezoTestnet.nativeCurrency, rpcUrls: ['https://rpc.test.mezo.org'], blockExplorerUrls: ['https://explorer.test.mezo.org']}]});
      } else throw err;
    }
    const c = await e.request({method: 'eth_chainId'});
    setChainId(parseInt(c, 16));
  }, []);

  const connect = useCallback(async () => {
    try {
      const e = eth();
      if (!e) { setHasWallet(false); return say('error', 'No wallet found. Install MetaMask or open this in a wallet browser.'); }
      const a = await e.request({method: 'eth_requestAccounts'});
      setAccount(a[0]);
      await switchChain();
    } catch (err) { say('error', err?.code === 4001 ? 'Request cancelled in wallet' : (err.shortMessage || err.message)); }
  }, [switchChain]);

  const wallet = useCallback(() => createWalletClient({account, chain: mezoTestnet, transport: custom(eth())}), [account]);

  const tx = useCallback(async (label, call) => {
    setBusy(label);
    try {
      const hash = await call(wallet());
      say('ok', `${label} sent, waiting for the chain`, hash);
      const r = await pub.waitForTransactionReceipt({hash});
      if (r.status !== 'success') throw new Error('Transaction reverted');
      return hash;
    } finally { setBusy(''); }
  }, [wallet]);

  const ensureAllowance = useCallback(async (token, spender, amount, label) => {
    const have = await pub.readContract({address: token, abi: erc20Abi, functionName: 'allowance', args: [account, spender]});
    if (have >= amount) return;
    await tx(label, (w) => w.writeContract({address: token, abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256]}));
  }, [account, tx]);

  const fail = (err) => say('error', err?.code === 4001 || /User rejected|denied/i.test(err?.message || '') ? 'Cancelled in wallet' : (err.shortMessage || err.message || 'Something went wrong').split('\n')[0]);

  // Gas is set explicitly: Mezo's estimator under-reports the vault's staking calls, so estimation would fail a valid deposit.
  const GAS = 3000000n;
  const depositBorrow = useCallback(async (btcAmt, musdAmt, borrowAmt) => {
    try {
      const a0 = parseUnits(String(btcAmt), 18), a1 = parseUnits(String(musdAmt), 18), b = parseUnits(String(borrowAmt), 18);
      await ensureAllowance(ADDR.btc, ADDR.vault, a0, 'Approve BTC');
      if (a1 > 0n) await ensureAllowance(ADDR.musd, ADDR.vault, a1, 'Approve MUSD');
      await tx('Add liquidity', (w) => w.writeContract({address: ADDR.vault, abi: vaultAbi, functionName: 'deposit', args: [a0, a1, 0n], gas: GAS}));
      const sh = await pub.readContract({address: ADDR.vault, abi: vaultAbi, functionName: 'balanceOf', args: [account]});
      await ensureAllowance(ADDR.vault, ADDR.morpho, sh, 'Approve position');
      await tx('Lock as collateral', (w) => w.writeContract({address: ADDR.morpho, abi: morphoAbi, functionName: 'supplyCollateral', args: [marketParams, sh, account, '0x'], gas: GAS}));
      let hash = null;
      if (b > 0n) hash = await tx('Borrow', (w) => w.writeContract({address: ADDR.morpho, abi: morphoAbi, functionName: 'borrow', args: [marketParams, b, 0n, account, account], gas: GAS}));
      say('ok', b > 0n ? 'Deposited and borrowed' : 'Deposited', hash); await read(account); return true;
    } catch (err) { fail(err); return false; }
  }, [account, ensureAllowance, tx, read]);

  const repay = useCallback(async (musdAmt) => {
    try {
      const a = parseUnits(String(musdAmt), 18);
      const data = await read(account);
      const full = data.borrowShares > 0n && musdAmt >= data.debt - 0.01; // settle by shares so no dust debt is left
      await ensureAllowance(ADDR.musd, ADDR.morpho, a, 'Approve MUSD');
      const hash = await tx('Repay', (w) => w.writeContract({address: ADDR.morpho, abi: morphoAbi, functionName: 'repay', args: full ? [marketParams, 0n, data.borrowShares, account, '0x'] : [marketParams, a, 0n, account, '0x'], gas: GAS}));
      say('ok', 'Repaid', hash); await read(account); return true;
    } catch (err) { fail(err); return false; }
  }, [account, ensureAllowance, tx, read]);

  const withdrawAll = useCallback(async () => {
    try {
      const d = await read(account);
      const col = d.collateralRaw;
      if (col > 0n) await tx('Take collateral back', (w) => w.writeContract({address: ADDR.morpho, abi: morphoAbi, functionName: 'withdrawCollateral', args: [marketParams, col, account, account], gas: GAS}));
      const d2 = await read(account);
      const sh = d2.sharesRaw;
      const hash = await tx('Withdraw liquidity', (w) => w.writeContract({address: ADDR.vault, abi: vaultAbi, functionName: 'withdraw', args: [sh], gas: GAS}));
      say('ok', 'Liquidity returned to your wallet', hash); await read(account); return true;
    } catch (err) { fail(err); return false; }
  }, [account, tx, read]);

  const value = useMemo(() => ({account, chainId, hasWallet, data, busy, note, dismiss: () => setNote(null), connect, switchChain, depositBorrow, repay, withdrawAll, refresh: () => read(account), wrongChain: Boolean(account) && chainId !== mezoTestnet.id, explorerTx, GAS_FLOOR}), [account, chainId, hasWallet, data, busy, note, connect, switchChain, depositBorrow, repay, withdrawAll, read]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useChain = () => { const v = useContext(Ctx); if (!v) throw new Error('useChain needs ChainProvider'); return v; };
