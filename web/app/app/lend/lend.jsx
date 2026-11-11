'use client';
import {useState} from 'react';
import {Activity, AreaChart, BigInput, Lab, Money, Orb, Problem, RangeTabs, Readout, Seg, SimFoot, Stats, parse, useSeries} from '../parts';
import {num, pct, useMarket, usd} from '../market-context';

export default function LendPage() {
  const {view, history, act, preview} = useMarket();
  const m = view.market;
  const [range, setRange] = useState(Infinity);
  const [mode, setMode] = useState('supply');
  const [v, setV] = useState('');
  const series = useSeries(history, 'sup', range);
  const n = parse(v), isSupply = mode === 'supply';
  const action = isSupply ? {type: 'supply', musd: n} : {type: 'withdrawSupply', musd: n};
  const pv = preview(action);
  const max = isSupply ? view.wallet.musd : Math.min(view.lend.supplied, Math.max(0, m.liquidity));
  const util = m.utilization;
  const tone = util > 0.9 ? 'bad' : util > 0.8 ? 'watch' : 'safe';
  const sup = view.lend.supplied;
  return (
    <div className="hk-wrap">
      <main id="main" className="hk-main">
        <section className="hk-hero">
          <div className="hk-hero-l">
            <Lab as="h1">Your supply</Lab>
            <div className="hk-big"><Money value={sup}/></div>
            <div className="hk-delta"><span>Earning <b>{usd(sup * m.supplyRate, 2)}</b> a year</span><span>Rate {pct(m.supplyRate, 2)}</span></div>
            {sup > 0 && series.filter((p) => p.v > 0).length > 1
              ? <><AreaChart points={series.filter((p) => p.v > 0)} label="Your supply over simulated days"/><RangeTabs value={range} onChange={setRange}/></>
              : <p className="hk-hint chart">Supply MUSD in the panel. Borrowers pay you interest every simulated day.</p>}
          </div>
          <Orb fill={util} tone={tone} label="Utilisation" value={pct(util, 1)} sub={util > 0.9 ? 'Past the kink, rates jump' : 'Of supply is borrowed'} aria={`Utilisation ${pct(util, 1)}`}/>
        </section>
        <Stats items={[
          ['Supply rate', (m.supplyRate * 100).toFixed(2), '%'],
          ['Borrow rate', (m.borrowRate * 100).toFixed(2), '%'],
          ['Withdrawable', usd(Math.max(0, m.liquidity), 0)],
          ['Bad debt', usd(m.badDebt, 0), '', m.badDebt > 0 ? 'bad' : ''],
        ]}/>
        <section className="hk-notes">
          <div><Lab>Who pays you</Lab><p>Borrowers, as interest that accrues every simulated day.</p></div>
          <div><Lab>When you can leave</Lab><p>Anytime, up to what is not lent out right now.</p></div>
          <div><Lab>The risk</Lab><p>In a deep crash, unpaid debt becomes a loss shared by suppliers.</p></div>
        </section>
        <Activity log={view.log} limit={4} filter={['lend', 'liquidation']} empty="No lending activity yet."/>
      </main>
      <aside className="hk-side" aria-label="Lend panel">
        <Seg label="Lend action" value={mode} onChange={(k) => { setMode(k); setV(''); }} options={[['supply', 'Supply'], ['withdraw', 'Withdraw']]}/>
        <div className="hk-panel" key={mode}>
          {isSupply && view.wallet.musd <= 0 ? (
            <>
              <div className="hk-amt"><Lab>You supply</Lab><div className="hk-amt-in"><b>0</b><span>MUSD</span></div></div>
              <p className="hk-hint">No MUSD in your demo wallet yet.</p>
              <button type="button" className="hk-btn" disabled={view.faucetLeft <= 0} onClick={() => act({type: 'faucet'}, 'Demo funds added to your wallet')}>Get demo funds</button>
            </>
          ) : (
            <>
              <BigInput label={isSupply ? 'You supply' : 'You withdraw'} unit="MUSD" value={v} onChange={setV} max={max} sub={isSupply ? `${usd(view.wallet.musd, 2)} in wallet` : `${usd(sup, 2)} supplied`}/>
              <Problem>{v !== '' && !pv.ok ? pv.error : null}</Problem>
              <button type="button" className="hk-btn" disabled={!pv.ok} onClick={() => { const r = act(action, isSupply ? `Supplied ${usd(n, 2)} MUSD` : `Withdrew ${usd(n, 2)} MUSD`); if (r.ok) setV(''); }}>{pv.ok ? `${isSupply ? 'Supply' : 'Withdraw'} ${num(n, 2)} MUSD` : max > 0 ? 'Enter an amount' : 'Nothing to withdraw'}</button>
              <Readout rows={[
                ['Supply after', usd(pv.ok ? pv.view.lend.supplied : sup, 2)],
                ['Earning', `${usd((pv.ok ? pv.view.lend.supplied * pv.view.market.supplyRate : sup * m.supplyRate), 2)} / yr`, 'ok'],
                ['Rate after', pct(pv.ok ? pv.view.market.supplyRate : m.supplyRate, 2)],
              ]}/>
            </>
          )}
        </div>
        <SimFoot/>
      </aside>
    </div>
  );
}
