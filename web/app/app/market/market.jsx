'use client';
import {useEffect, useMemo, useState} from 'react';
import {PARAMS} from '../../engine.mjs';
import {Glyph} from '../glyph';
import {Activity, Lab, Money, Orb, Readout, Seg, SimFoot, Stats} from '../parts';
import {pct, useMarket, usd} from '../market-context';

const {base, kinkUtil, kinkRate, maxRate} = PARAMS.irm;
const rateAt = (u) => (u <= kinkUtil ? base + (kinkRate - base) * (u / kinkUtil) : kinkRate + (maxRate - kinkRate) * ((u - kinkUtil) / (1 - kinkUtil)));

function RateCurve({util}) {
  const path = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 100; i++) { const u = i / 100; pts.push(`${i ? 'L' : 'M'}${(u * 600).toFixed(1)},${(150 - rateAt(u) / maxRate * 136).toFixed(1)}`); }
    return pts.join('');
  }, []);
  const x = Math.min(1, Math.max(0, util)), y = 150 - rateAt(x) / maxRate * 136;
  return (
    <div className="hk-curve" role="img" aria-label={`Borrow rate curve, now ${pct(rateAt(x), 2)} at ${pct(x, 1)} utilisation`}>
      <svg viewBox="0 0 600 150" preserveAspectRatio="none">
        <line x1={kinkUtil * 600} x2={kinkUtil * 600} y1="0" y2="150" className="kink" vectorEffect="non-scaling-stroke"/>
        <path d={`${path}L600,150L0,150Z`} className="fill"/>
        <path d={path} className="ln" vectorEffect="non-scaling-stroke"/>
      </svg>
      <i className="hk-chart-dot" style={{left: `${x * 100}%`, top: `${y / 1.5}%`}}/>
      <span className="tag" style={{left: `${kinkUtil * 100}%`}}>Kink {pct(kinkUtil, 0)}</span>
      <div className="ax"><span>0%</span><span>Utilisation</span><span>100%</span></div>
    </div>
  );
}

export default function MarketPage() {
  const {view, act, preview} = useMarket();
  const live = view.prices.btc, peg = view.prices.musd;
  const [mode, setMode] = useState('btc');
  const [btc, setBtc] = useState(live);
  const [mp, setMp] = useState(peg);
  useEffect(() => setBtc(live), [live]);
  useEffect(() => setMp(peg), [peg]);
  const isBtc = mode === 'btc';
  const action = isBtc ? {type: 'shock', btcPrice: btc} : {type: 'shock', musdPrice: mp};
  const pv = preview(action);
  const p = view.position, np = pv.ok ? pv.view.position : null;
  const changed = isBtc ? btc !== live : mp !== peg;
  const m = view.market;
  const lim = PARAMS.limits;
  return (
    <div className="hk-wrap">
      <main id="main" className="hk-main">
        <section className="hk-hero">
          <div className="hk-hero-l">
            <Lab as="h1">BTC price</Lab>
            <div className="hk-big"><Money value={live} d={0}/></div>
            <div className="hk-delta"><span>MUSD <b>{usd(peg, 3)}</b></span><span>Day {view.t}</span><span>Max loan to value {pct(PARAMS.lltv, 0)}</span></div>
            <RateCurve util={m.utilization}/>
          </div>
          <Orb fill={m.utilization} tone={m.utilization > kinkUtil ? 'bad' : 'safe'} label="Borrow rate" value={pct(m.borrowRate, 2)} sub={`At ${pct(m.utilization, 1)} utilisation`} aria={`Borrow rate ${pct(m.borrowRate, 2)}`}/>
        </section>
        <Stats items={[
          ['Total supplied', usd(m.supplyAssets, 0)],
          ['Total borrowed', usd(m.borrowAssets, 0)],
          ['Supply rate', (m.supplyRate * 100).toFixed(2), '%'],
          ['Bad debt', usd(m.badDebt, 0), '', m.badDebt > 0 ? 'bad' : ''],
        ]}/>
        <Activity log={view.log} limit={5} filter={['price', 'time', 'liquidation']} title="Market events" empty="No price moves yet. Use the panel to stress the market."/>
      </main>
      <aside className="hk-side" aria-label="Market controls">
        <Seg label="Price to move" value={mode} onChange={setMode} options={[['btc', 'BTC price'], ['peg', 'MUSD peg']]}/>
        <div className="hk-panel" key={mode}>
          <div className="hk-amt">
            <Lab as="label" htmlFor="px">{isBtc ? 'Set BTC to' : 'Set MUSD to'}</Lab>
            <div className="hk-amt-in"><b>{isBtc ? usd(btc, 0) : usd(mp, 3)}</b></div>
          </div>
          <div className="hk-ratio">
            {isBtc
              ? <input id="px" type="range" min={lim.minBtc} max={lim.maxBtc} step="1000" value={btc} onChange={(e) => setBtc(Number(e.target.value))} style={{'--f': `${(btc - lim.minBtc) / (lim.maxBtc - lim.minBtc) * 100}%`}}/>
              : <input id="px" type="range" min={lim.minPeg} max={lim.maxPeg} step="0.005" value={mp} onChange={(e) => setMp(Number(e.target.value))} style={{'--f': `${(mp - lim.minPeg) / (lim.maxPeg - lim.minPeg) * 100}%`}}/>}
            <div className="ticks">{isBtc ? <><span>{usd(lim.minBtc, 0)}</span><span>{usd(lim.maxBtc, 0)}</span></> : <><span>{usd(lim.minPeg, 2)}</span><span>{usd(lim.maxPeg, 2)}</span></>}</div>
          </div>
          <div className="hk-chips wide" role="group" aria-label="Presets">
            {(isBtc ? [[0.7, 'Crash 30%'], [0.5, 'Crash 50%'], [1.2, 'Rally 20%']].map(([k, l]) => [Math.round(live * k / 1000) * 1000, l]) : [[0.97, 'Depeg 3%'], [0.9, 'Depeg 10%'], [1, 'Back to $1']])
              .map(([val, l]) => <button key={l} type="button" onClick={() => (isBtc ? setBtc(Math.min(lim.maxBtc, Math.max(lim.minBtc, val))) : setMp(val))}>{l}</button>)}
          </div>
          <button type="button" className="hk-btn" disabled={!changed || !pv.ok} onClick={() => act(action, isBtc ? `BTC set to ${usd(btc, 0)}` : `MUSD set to ${usd(mp, 3)}`)}>{changed ? 'Apply to market' : 'Move the slider'}</button>
          <Readout rows={p.debt > 0 ? [
            ['Your health after', np?.health ? np.health.toFixed(2) : 'None', np?.liquidatable ? 'bad' : np?.health < 1.5 ? 'warn' : 'ok'],
            ['Liquidation price', np?.liquidationBtcPrice ? usd(np.liquidationBtcPrice, 0) : 'None'],
            ['Collateral after', usd(np ? np.collateralValue : p.collateralValue, 0)],
          ] : [['Your position', 'No debt, nothing at risk']]}/>
          {p.liquidatable && <button type="button" className="hk-btn danger" onClick={() => act({type: 'liquidate'}, 'Keepers liquidated the position')}><Glyph name="bolt" size={16}/>Run liquidation</button>}
        </div>
        <SimFoot/>
      </aside>
    </div>
  );
}
