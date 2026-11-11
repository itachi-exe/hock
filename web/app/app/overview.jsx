'use client';
import {useState} from 'react';
import {PARAMS} from '../engine.mjs';
import {Glyph, PairIcon} from './glyph';
import {Activity, AreaChart, BigInput, Lab, Money, Orb, Problem, RangeTabs, Readout, Seg, SimFoot, Stats, healthState, parse, useSeries} from './parts';
import {num, pct, useMarket, usd} from './market-context';

const friendly = (e) => (/valid MUSD amount/.test(e || '') ? 'Move the slider right to borrow more.' : e);
const mo = (n) => `${usd(n / 12, 2)} / mo`;

function Onboarding({step}) {
  const steps = ['Get demo funds', 'Hock your LP', 'Borrow MUSD'];
  return (
    <ol className="hk-steps" aria-label="Getting started">
      {steps.map((s, i) => (
        <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
          <span>{i < step ? <Glyph name="check" size={14}/> : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

function Hero({sim}) {
  const {view, history, state} = useMarket();
  const [range, setRange] = useState(Infinity);
  const series = useSeries(history, 'net', range);
  const p = view.position;
  const net = series.length ? series[series.length - 1].v : 0;
  const change = series.length > 1 ? net - series[0].v : 0;
  const fresh = state.log.length === 0;
  const step = state.user.claims === 0 ? 0 : p.collateralShares === 0 ? 1 : 2;
  const pos = sim?.pos || p;
  const h = pos.health, st = healthState(h);
  return (
    <section className="hk-hero">
      <div className="hk-hero-l">
        <Lab as="h1">Net position</Lab>
        <div className="hk-big"><Money value={fresh ? 0 : netFrom(view)}/></div>
        <div className="hk-delta">
          {series.length > 1 && <span><b className={change < 0 ? 'neg' : ''}>{change >= 0 ? '+' : ''}{usd(change, 2)}</b> {range === Infinity ? 'all time' : `in ${range === 365 ? '1Y' : range + 'D'}`}</span>}
          <span>Collateral {usd(p.collateralValue, 0)}</span>
          <span>Debt {usd(p.debt, 0)}</span>
        </div>
        {p.debt > 0 || series.length > 1 ? (
          <>
            <AreaChart points={series} label="Net position over simulated days"/>
            {series.length > 1 && <RangeTabs value={range} onChange={setRange}/>}
          </>
        ) : <Onboarding step={step}/>}
      </div>
      <Orb
        fill={h === null ? 0 : h / 3}
        tone={st.key}
        label={sim ? 'Health if BTC hits' : 'Health'}
        value={h === null ? 'None' : h.toFixed(2)}
        sub={h === null ? 'Nothing to liquidate' : sim ? `${st.label} at ${usd(sim.price, 0)}` : st.label}
        aria={`Health ${h === null ? 'none' : h.toFixed(2)}, ${st.label}`}
      />
    </section>
  );
}

const netFrom = (v) => v.wallet.btc * v.prices.btcInMusd + v.wallet.musd + v.wallet.shareValue + v.position.collateralValue + v.lend.supplied - v.position.debt;

function Stress({sim, setSim}) {
  const {view, act} = useMarket();
  const live = view.prices.btc, p = view.position;
  const min = PARAMS.limits.minBtc, max = Math.min(PARAMS.limits.maxBtc, Math.max(200000, live * 1.5));
  const price = sim?.price ?? live;
  const pos = sim?.pos || p;
  const liq = pos.liquidationBtcPrice;
  const at = (v) => Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
  const liqAt = liq ? at(liq) : 0, watchAt = liq ? at(liq * 2.25) : 0;
  const bg = liq
    ? `linear-gradient(90deg,var(--danger) 0 ${liqAt}%,var(--warn) ${liqAt}% ${watchAt}%,rgba(108,192,156,.55) ${watchAt}%)`
    : 'rgba(255,255,255,.12)';
  const room = liq ? 1 - liq / price : null;
  const changed = sim && sim.price !== live;
  return (
    <section className="hk-stress" aria-label="Stress test">
      <div><Lab as="label" htmlFor="btcp">If BTC hits</Lab><div className="pv">{usd(price, 0)}</div></div>
      <div className="hk-track" style={{'--tb': bg}}>
        {liq && liqAt > 0 && <div className="liq" style={{left: `${liqAt}%`}}><i>Liquidation {usd(liq, 0)}</i></div>}
        <div className="now" style={{left: `${at(live)}%`}}>Now {usd(live, 0)}</div>
        <input id="btcp" type="range" min={min} max={max} step="500" value={price} onChange={(e) => setSim(Number(e.target.value))}/>
      </div>
      <div className="buf">
        <Lab>Room before liquidation</Lab>
        <div className={`pv ${room === null ? 'mut' : room <= 0 ? 'bad' : room < 0.25 ? 'warn' : 'ok'}`}>{room === null ? 'No debt' : room <= 0 ? 'None' : pct(room, 1)}</div>
      </div>
      {(changed || p.liquidatable || (!sim && live !== 100000)) && (
        <div className="hk-stress-act">
          {changed && <><span>Preview only. Nothing changed yet.</span><button type="button" className="hk-sm" onClick={() => { const r = act({type: 'shock', btcPrice: sim.price}, `BTC set to ${usd(sim.price, 0)}`); if (r.ok) setSim(null); }}>Apply to market</button><button type="button" className="hk-sm quiet" onClick={() => setSim(null)}>Cancel</button></>}
          {!changed && p.liquidatable && <><span className="bad">This position can be liquidated now.</span><button type="button" className="hk-sm danger" onClick={() => act({type: 'liquidate'}, 'Keepers liquidated the position')}><Glyph name="bolt" size={14}/>Run liquidation</button></>}
          {!changed && !p.liquidatable && live !== 100000 && <><span>Market BTC is {usd(live, 0)}.</span><button type="button" className="hk-sm quiet" onClick={() => act({type: 'shock', btcPrice: 100000}, 'BTC back to $100,000')}>Back to $100,000</button></>}
        </div>
      )}
    </section>
  );
}

function BorrowMode() {
  const {view, act, preview} = useMarket();
  const p = view.position, price = view.prices.btcInMusd;
  const [btc, setBtc] = useState('');
  const [picked, setLtv] = useState(null);
  const ltv = picked ?? Math.min(0.6, Math.max(0.4, Math.ceil((p.ltv + 0.1) * 20) / 20));
  const btcN = parse(btc), adding = btcN > 0;
  const musdIn = adding ? Math.round(btcN * price * 100) / 100 : 0;
  const maxBtc = Math.max(0, Math.min(view.wallet.btc, view.wallet.musd / price));
  const broke = view.wallet.btc <= 0 && view.wallet.musd <= 0 && p.collateralShares === 0 && view.wallet.shares === 0;
  const target = p.collateralValue * ltv - p.debt;
  const action = adding ? {type: 'hock', btc: btcN, musd: musdIn, ltv} : {type: 'borrow', musd: target};
  const pv = p.collateralShares > 0 || adding ? preview(action) : {ok: false, error: null};
  const np = pv.ok ? pv.view.position : null;
  const got = np ? np.debt - p.debt : 0;
  const below = !adding && p.collateralShares > 0 && target <= 0;
  const error = below ? null : adding || p.collateralShares > 0 ? (pv.ok ? null : friendly(pv.error)) : null;
  if (broke) {
    return (
      <>
        <div className="hk-coll"><PairIcon/><div className="t">BTC / MUSD LP<small>Nothing hocked yet</small></div></div>
        <div className="hk-amt"><Lab>You borrow</Lab><div className="hk-amt-in"><b>0</b><span>MUSD</span></div></div>
        <p className="hk-hint">Your demo wallet is empty. Fund it to try a borrow. No keys, no real money.</p>
        <button type="button" className="hk-btn" onClick={() => act({type: 'faucet'}, 'Demo funds added to your wallet')}>Get demo funds</button>
      </>
    );
  }
  return (
    <>
      <div className="hk-coll">
        <PairIcon/>
        <div className="t">BTC / MUSD LP<small>{p.collateralShares > 0 ? `${num(p.collateralShares, 0)} shares posted` : 'Collateral'}</small></div>
        <div className="r">{usd(p.collateralValue, 0)}</div>
      </div>
      <div className="hk-add">
        <label htmlFor="addbtc">Add from wallet</label>
        <div className="box"><input id="addbtc" inputMode="decimal" autoComplete="off" placeholder="0" value={btc} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setBtc(e.target.value)}/><span>BTC</span>{maxBtc > 0 && <button type="button" onClick={() => setBtc(String(Math.floor(maxBtc * 1e4) / 1e4))}>Max</button>}</div>
        <small>{adding ? `+ ${num(musdIn, 2)} MUSD matched from wallet` : p.collateralShares > 0 ? 'Optional. Leave empty to borrow on what you have.' : 'MUSD side is matched for you.'}</small>
      </div>
      <div className="hk-amt"><Lab>You borrow</Lab><div className="hk-amt-in"><b>{got > 0 ? num(got, 0) : '0'}</b><span>MUSD</span></div></div>
      <div className="hk-ratio">
        <Lab as="label" htmlFor="ltv">Of collateral, {pct(ltv, 0)}</Lab>
        <div className="wrapr">
          <input id="ltv" type="range" min="0.05" max="0.7" step="0.01" value={ltv} onChange={(e) => setLtv(Number(e.target.value))} className={ltv > PARAMS.safeLtv ? 'hot' : ''} style={{'--f': `${(ltv - 0.05) / 0.65 * 100}%`}}/>
          <i className="mk" style={{left: `${(PARAMS.safeLtv - 0.05) / 0.65 * 100}%`}}/>
          {p.ltv > 0.05 && p.ltv < 0.7 && <i className="mk cur" style={{left: `${(p.ltv - 0.05) / 0.65 * 100}%`}}/>}
        </div>
        <div className="ticks"><span>{p.ltv > 0 ? `Now ${pct(p.ltv, 0)}` : '5%'}</span><span className="bad">Risky past {pct(PARAMS.safeLtv, 0)}</span></div>
      </div>
      <Problem>{error}</Problem>
      <button type="button" className="hk-btn" disabled={!pv.ok || got <= 0} onClick={() => { const r = act(action, `Borrowed ${usd(got, 0)} MUSD against your LP`); if (r.ok) setBtc(''); }}>
        {pv.ok && got > 0 ? `Borrow ${num(got, 0)} MUSD` : below ? `Slide past ${pct(p.ltv, 0)} to borrow more` : p.collateralShares > 0 ? 'Borrow' : 'Add BTC to start'}
      </button>
      <Readout rows={[
        ['Health after', np?.health ? np.health.toFixed(2) : p.health ? p.health.toFixed(2) : 'None', np && np.health && np.health < 1.5 ? 'warn' : 'ok'],
        ['Liquidation price', np?.liquidationBtcPrice ? usd(np.liquidationBtcPrice, 0) : p.liquidationBtcPrice ? usd(p.liquidationBtcPrice, 0) : 'None'],
        ['Interest', mo(np ? np.yearlyCost : p.yearlyCost)],
      ]}/>
    </>
  );
}

function RepayMode() {
  const {view, act, preview} = useMarket();
  const p = view.position;
  const [v, setV] = useState('');
  const n = parse(v);
  const pv = preview({type: 'repay', musd: n});
  const np = pv.ok ? pv.view.position : null;
  if (p.debt <= 0) return <p className="hk-hint pad">You have no debt to repay.</p>;
  return (
    <>
      <BigInput label="You repay" unit="MUSD" value={v} onChange={setV} max={Math.min(p.debt, view.wallet.musd)} sub={`Debt ${usd(p.debt, 2)}, wallet ${usd(view.wallet.musd, 2)}`}/>
      <Problem>{v !== '' && !pv.ok ? pv.error : null}</Problem>
      <button type="button" className="hk-btn" disabled={!pv.ok} onClick={() => { const r = act({type: 'repay', musd: n}, `Repaid ${usd(n, 2)} MUSD`); if (r.ok) setV(''); }}>{pv.ok ? `Repay ${num(n, 2)} MUSD` : 'Enter an amount'}</button>
      <Readout rows={[
        ['Debt after', usd(np ? np.debt : p.debt, 2)],
        ['Health after', np ? (np.health ? np.health.toFixed(2) : 'No debt') : p.health.toFixed(2), 'ok'],
        ['Interest', mo(np ? np.yearlyCost : p.yearlyCost)],
      ]}/>
    </>
  );
}

function CollateralMode() {
  const {view, act, preview} = useMarket();
  const p = view.position;
  const [dir, setDir] = useState('add');
  const [v, setV] = useState('');
  const n = parse(v), add = dir === 'add';
  const action = add ? {type: 'postCollateral', shares: n} : {type: 'removeCollateral', shares: n};
  const pv = preview(action);
  const np = pv.ok ? pv.view.position : null;
  const max = add ? view.wallet.shares : p.collateralShares;
  return (
    <>
      <div className="hk-mini" role="group" aria-label="Collateral direction">
        {[['add', 'Add'], ['remove', 'Take back']].map(([k, l]) => <button key={k} type="button" className={dir === k ? 'on' : ''} aria-pressed={dir === k} onClick={() => { setDir(k); setV(''); }}>{l}</button>)}
      </div>
      <BigInput label={add ? 'Shares to post' : 'Shares to take back'} unit="shares" value={v} onChange={setV} max={max} sub={add ? `${num(view.wallet.shares, 2)} shares in wallet` : `${num(p.collateralShares, 2)} shares posted`}/>
      <Problem>{v !== '' && !pv.ok ? pv.error : null}</Problem>
      <button type="button" className="hk-btn" disabled={!pv.ok} onClick={() => { const r = act(action, `${add ? 'Posted' : 'Took back'} ${num(n, 2)} shares`); if (r.ok) setV(''); }}>{pv.ok ? `${add ? 'Post' : 'Take back'} ${num(n, 2)} shares` : max > 0 ? 'Enter an amount' : add ? 'No shares in wallet' : 'Nothing posted'}</button>
      <Readout rows={[
        ['Collateral after', usd(np ? np.collateralValue : p.collateralValue, 0)],
        ['Health after', (np || p).health ? (np || p).health.toFixed(2) : 'No debt', 'ok'],
      ]}/>
    </>
  );
}

function Panel() {
  const {view} = useMarket();
  const [mode, setMode] = useState('borrow');
  return (
    <aside className="hk-side" aria-label="Borrow panel">
      <Seg label="Position action" value={mode} onChange={setMode} options={[['borrow', 'Borrow'], ['repay', 'Repay'], ['collateral', 'Collateral']]}/>
      {view.position.liquidatable && <div className="hk-alarm"><Glyph name="warn" size={16}/>Liquidatable. Repay or add collateral.</div>}
      <div className="hk-panel" key={mode}>
        {mode === 'borrow' && <BorrowMode/>}
        {mode === 'repay' && <RepayMode/>}
        {mode === 'collateral' && <CollateralMode/>}
      </div>
      <SimFoot/>
    </aside>
  );
}

export default function Position() {
  const {view, preview} = useMarket();
  const [simPrice, setSimPrice] = useState(null);
  const pv = simPrice !== null ? preview({type: 'shock', btcPrice: simPrice}) : null;
  const sim = pv && pv.ok ? {price: simPrice, pos: pv.view.position} : null;
  const m = view.market;
  return (
    <div className="hk-wrap">
      <main id="main" className="hk-main">
        <Hero sim={sim}/>
        <Stress sim={sim} setSim={setSimPrice}/>
        <Stats items={[
          ['Borrow rate', (m.borrowRate * 100).toFixed(2), '%'],
          ['Vault APY', (view.vault.emissionApr * (1 - PARAMS.vault.feeRate) * 100).toFixed(1), '%'],
          ['Utilisation', (m.utilization * 100).toFixed(1), '%'],
          ['You earn', usd(view.position.yearlyEarn - view.position.yearlyCost, 0), ' / yr', view.position.yearlyEarn - view.position.yearlyCost >= 0 ? 'ok' : 'bad'],
        ]}/>
        <Activity log={view.log} limit={4}/>
      </main>
      <Panel/>
    </div>
  );
}
