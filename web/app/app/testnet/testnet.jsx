'use client';
import {useState} from 'react';
import {Glyph} from '../glyph';
import {Lab, Money, Orb, Problem, Readout, Seg, Stats, BigInput, parse, healthState} from '../parts';
import {num, pct, usd} from '../market-context';
import {useChain} from '../chain-context';
import {ADDR, FAUCET, MUSD_GUIDE, isDeployed} from '../../chain/config.mjs';

const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '');

function Panel() {
  const c = useChain();
  const d = c.data;
  const [mode, setMode] = useState('borrow');
  const [btc, setBtc] = useState('');
  const [ltv, setLtv] = useState(0.3);
  const [rep, setRep] = useState('');
  const px = d?.btcPrice || 0;
  const n = parse(btc);
  const need = n > 0 ? n * px : 0;
  const worth = n > 0 ? n * px + need : 0;
  const borrow = Math.floor(worth * ltv);
  const maxBtc = Math.max(0, Math.min((d?.btc || 0) - c.GAS_FLOOR, (d?.musd || 0) / (px || 1)));
  const over = n > 0 && (n > (d?.btc || 0) - c.GAS_FLOOR || need > (d?.musd || 0));

  if (!c.account) return (
    <div className="hk-panel">
      <div className="hk-amt"><Lab>Testnet</Lab><div className="hk-amt-in"><b>Connect</b></div></div>
      <p className="hk-hint">Use any EVM wallet. Hock adds Mezo Testnet for you.</p>
      <button type="button" className="hk-btn" onClick={c.connect}>{c.hasWallet ? 'Connect wallet' : 'Install a wallet'}</button>
    </div>
  );
  if (c.wrongChain) return (
    <div className="hk-panel">
      <div className="hk-amt"><Lab>Wrong network</Lab><div className="hk-amt-in"><b>Mezo</b><span>Testnet</span></div></div>
      <p className="hk-hint">Your wallet is on another network.</p>
      <button type="button" className="hk-btn" onClick={() => c.switchChain().catch(() => {})}>Switch to Mezo Testnet</button>
    </div>
  );
  if (d && d.btc < c.GAS_FLOOR) return (
    <div className="hk-panel">
      <div className="hk-amt"><Lab>Test BTC</Lab><div className="hk-amt-in"><b>0</b><span>BTC</span></div></div>
      <p className="hk-hint">You need a little test BTC for gas. Paste your address in the Mezo faucet, then come back.</p>
      <button type="button" className="hk-btn" onClick={() => navigator.clipboard?.writeText(c.account).then(() => window.open(FAUCET, '_blank', 'noopener'))}>Copy address and open faucet</button>
    </div>
  );
  if (d && d.musd < 1 && !(d.shares > 0) && !(d.collateral > 0) && !(d.debt > 0)) return (
    <div className="hk-panel">
      <div className="hk-amt"><Lab>Test MUSD</Lab><div className="hk-amt-in"><b>0</b><span>MUSD</span></div></div>
      <p className="hk-hint">A deposit pairs BTC with MUSD. Mint test MUSD on Mezo with your test BTC, then come back.</p>
      <button type="button" className="hk-btn" onClick={() => window.open(MUSD_GUIDE, '_blank', 'noopener')}>How to mint test MUSD</button>
    </div>
  );
  if (!isDeployed) return (
    <div className="hk-panel">
      <div className="hk-amt"><Lab>Hock on testnet</Lab><div className="hk-amt-in"><b>Soon</b></div></div>
      <p className="hk-hint">Your wallet is ready: {num(d?.btc || 0, 4)} test BTC. The Hock contracts are being put on Mezo Testnet.</p>
      <button type="button" className="hk-btn" disabled>Deposit and borrow</button>
    </div>
  );
  return (
    <>
      <Seg label="Testnet action" value={mode} onChange={setMode} options={[['borrow', 'Borrow'], ['repay', 'Repay'], ['exit', 'Exit']]}/>
      <div className="hk-panel" key={mode}>
        {mode === 'borrow' && (
          <>
            <BigInput label="You deposit" unit="BTC" decimals={4} value={btc} onChange={setBtc} max={maxBtc} sub={n > 0 ? `+ ${num(need, 2)} MUSD from your wallet` : `${num(d?.btc || 0, 4)} BTC, ${num(d?.musd || 0, 2)} MUSD in wallet`}/>
            <div className="hk-chips wide" role="group" aria-label="Borrow share">
              {[[0.2, 'Careful'], [0.3, 'Balanced'], [0.45, 'Bold']].map(([v, l]) => <button key={l} type="button" className={ltv === v ? 'on' : ''} onClick={() => setLtv(v)}>{l}</button>)}
            </div>
            <Problem>{over ? 'Not enough BTC or MUSD in your wallet for that amount.' : null}</Problem>
            <button type="button" className="hk-btn" disabled={!n || over || Boolean(c.busy)} onClick={() => c.depositBorrow(n, need, borrow).then((ok) => ok && setBtc(''))}>{c.busy || (n > 0 && !over ? `Borrow ${num(borrow, 0)} MUSD` : 'Enter an amount')}</button>
            <Readout rows={[['Collateral worth', n > 0 ? usd(worth, 0) : 'None'], ['You borrow', n > 0 ? `${num(borrow, 0)} MUSD` : 'None'], ['Steps in wallet', 'Up to 4, once']]}/>
          </>
        )}
        {mode === 'repay' && (
          <>
            <BigInput label="You repay" unit="MUSD" value={rep} onChange={setRep} max={Math.min(d?.debt || 0, d?.musd || 0)} sub={`${usd(d?.debt || 0, 2)} owed`}/>
            <Problem>{parse(rep) > (d?.musd || 0) ? 'More than your wallet holds.' : null}</Problem>
            <button type="button" className="hk-btn" disabled={!(parse(rep) > 0) || parse(rep) > (d?.musd || 0) || Boolean(c.busy)} onClick={() => c.repay(parse(rep)).then((ok) => ok && setRep(''))}>{c.busy || (parse(rep) > 0 ? `Repay ${num(parse(rep), 2)} MUSD` : 'Enter an amount')}</button>
          </>
        )}
        {mode === 'exit' && (
          <>
            <div className="hk-amt"><Lab>You get back</Lab><div className="hk-amt-in"><b>{usd(d?.collateralValue || 0, 0)}</b></div></div>
            <p className="hk-hint">{d?.debt > 0.01 ? 'Repay your debt first.' : 'Takes your collateral back and returns the BTC and MUSD.'}</p>
            <button type="button" className="hk-btn" disabled={!(d?.collateral > 0) || d?.debt > 0.01 || Boolean(c.busy)} onClick={c.withdrawAll}>{c.busy || 'Withdraw everything'}</button>
          </>
        )}
      </div>
    </>
  );
}

export default function Testnet() {
  const c = useChain();
  const d = c.data;
  const net = d ? d.collateralValue - d.debt : 0;
  const hs = d?.health ? healthState(d.health) : null;
  const steps = [['Connect wallet', Boolean(c.account)], ['Get test BTC', Boolean(d && d.btc >= c.GAS_FLOOR && c.account)], ['Deposit and borrow', Boolean(d && d.collateral > 0)]];
  const now = steps.findIndex(([, done]) => !done);
  return (
    <div className="hk-wrap">
      <main id="main" className="hk-main">
        <section className="hk-hero">
          <div className="hk-hero-l">
            <Lab as="h1">Your position on Mezo Testnet</Lab>
            <div className="hk-big"><Money value={net} d={0}/></div>
            <div className="hk-delta"><span>BTC <b>{d?.btcPrice ? usd(d.btcPrice, 0) : '...'}</b></span><span title="Testnet feed, not a market price">MUSD <b>$1.00</b> test feed</span><span>Block {d?.block ?? '...'}</span>{c.account && <span>{short(c.account)}</span>}</div>
            <ol className="hk-steps">{steps.map(([l, done], i) => <li key={l} className={done ? 'done' : i === now ? 'now' : ''}><span>{done ? <Glyph name="check" size={13}/> : i + 1}</span>{l}</li>)}</ol>
            {d?.error && <Problem>Could not reach the testnet RPC. Retrying.</Problem>}
          </div>
          <Orb fill={d?.health ? Math.min(1, 1 / d.health) : 0} tone={hs?.key || 'none'} label="Health" value={d?.health ? d.health.toFixed(2) : 'None'} sub={d?.health ? hs.label : 'No debt yet'} aria={d?.health ? `Health ${d.health.toFixed(2)}` : 'No debt'}/>
        </section>
        <Stats items={[
          ['Test BTC', num(d?.btc || 0, 4)],
          ['MUSD', usd(d?.musd || 0, 0)],
          ['Debt', usd(d?.debt || 0, 0), '', d?.debt > 0 ? '' : 'mut'],
          ['Liquidation', d?.liqPrice ? usd(d.liqPrice, 0) : 'None'],
        ]}/>
        <section className="hk-notes">
          <div><Lab>Real chain</Lab><p>Every action is a signed transaction on Mezo Testnet, chain 31611.</p></div>
          <div><Lab>Test money</Lab><p>Test BTC has no value. Nothing here touches mainnet.</p></div>
          <div><Lab>Price feed</Lab><p>BTC comes from Mezo's own feed. MUSD uses a labelled test feed until Mezo refreshes theirs.</p></div>
        </section>
      </main>
      <aside className="hk-side" aria-label="Testnet panel">
        <Panel/>
        <div className="hk-foot"><i className="hk-dot"/>Mezo Testnet, test funds only</div>
      </aside>
    </div>
  );
}
