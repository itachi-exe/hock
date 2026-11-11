'use client';
import {useId, useMemo} from 'react';
import {Glyph} from './glyph';
import {num, usd} from './market-context';

export const parse = (s) => (String(s).trim() === '' ? NaN : Number(s));

export function Lab({children, as: T = 'div', ...rest}) {
  return <T className="hk-lab" {...rest}>{children}</T>;
}

// Big money figure: cents drop to the muted colour like the approved mockup.
export function Money({value, d = 2}) {
  const s = usd(value, d);
  const i = s.lastIndexOf('.');
  return d > 0 && i > 0 ? <>{s.slice(0, i)}<span>{s.slice(i)}</span></> : <>{s}</>;
}

export function healthState(h) {
  if (h === null || h === undefined) return {key: 'none', label: 'No debt'};
  if (h < 1) return {key: 'bad', label: 'Liquidatable'};
  if (h < 1.15) return {key: 'risk', label: 'At risk'};
  if (h < 1.5) return {key: 'watch', label: 'Watch'};
  return {key: 'safe', label: 'Safe'};
}

// Silver loop orb with an arc. Used for health, utilisation and stake.
export function Orb({fill = 0, tone = 'safe', label, value, sub, aria}) {
  const C = 2 * Math.PI * 150, arc = C * 0.75;
  const f = Math.max(0, Math.min(1, fill));
  return (
    <div className={`hk-orb ${tone}`} role="img" aria-label={aria}>
      <img src="/art/liquidity.webp" alt=""/>
      <svg viewBox="0 0 360 360" aria-hidden="true">
        <circle cx="180" cy="180" r="150" className="trk" strokeDasharray={`${arc} ${C}`} transform="rotate(135 180 180)"/>
        {f > 0 && <circle cx="180" cy="180" r="150" className="arc" strokeDasharray={`${arc * f} ${C}`} transform="rotate(135 180 180)"/>}
      </svg>
      <div className="hk-orb-in"><Lab>{label}</Lab><div className="v">{value}</div><div className="s">{sub}</div></div>
    </div>
  );
}

export const RANGES = [[7, '7D'], [30, '30D'], [365, '1Y'], [Infinity, 'All']];

export function RangeTabs({value, onChange}) {
  return (
    <div className="hk-range" role="group" aria-label="Chart range">
      {RANGES.map(([d, l]) => <button key={l} type="button" className={value === d ? 'on' : ''} aria-pressed={value === d} onClick={() => onChange(d)}>{l}</button>)}
    </div>
  );
}

// Line and glow area chart over simulated days.
export function AreaChart({points, label}) {
  const id = useId().replace(/:/g, '');
  const d = useMemo(() => {
    const pts = points;
    if (pts.length < 2) return null;
    const W = 600, H = 150, top = 14, bot = 10;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || 1;
    const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
    const span = hi - lo || Math.max(1, Math.abs(hi) * 0.02);
    const x = (t) => (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * W;
    const y = (v) => hi === lo ? H / 2 : top + (1 - (v - lo) / span) * (H - top - bot);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    return {line, area: `${line}L${W},${H}L0,${H}Z`, ex: x(last.t), ey: y(last.v)};
  }, [points]);
  return (
    <div className="hk-chart" role="img" aria-label={label}>
      {d ? (
        <svg viewBox="0 0 600 150" preserveAspectRatio="none">
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6cc09c" stopOpacity=".28"/><stop offset="1" stopColor="#6cc09c" stopOpacity="0"/></linearGradient></defs>
          <path d={d.area} fill={`url(#${id})`}/>
          <path d={d.line} fill="none" stroke="#6cc09c" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
        </svg>
      ) : <div className="hk-chart-empty"><span>The chart fills in as days pass. Move time forward from the wallet menu.</span></div>}
      {d && <i className="hk-chart-dot" style={{left: `${d.ex / 6}%`, top: `${d.ey / 1.5}%`}}/>}
    </div>
  );
}

export function useSeries(history, key, range) {
  return useMemo(() => {
    if (!history.length) return [];
    const end = history[history.length - 1].t;
    return history.filter((h) => h.t >= end - range).map((h) => ({t: h.t, v: h[key]}));
  }, [history, key, range]);
}

export function Seg({options, value, onChange, label}) {
  return (
    <div className="hk-seg" role="tablist" aria-label={label} style={{gridTemplateColumns: `repeat(${options.length},1fr)`}}>
      {options.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

// The one big editable number in a panel.
export function BigInput({label, value, onChange, unit, max, decimals = 2, sub}) {
  const id = useId();
  return (
    <div className="hk-amt">
      <div className="hk-amt-top">
        <Lab as="label" htmlFor={id}>{label}</Lab>
        {max !== undefined && max > 0 && <button type="button" className="hk-max" onClick={() => onChange(String(Math.floor(max * 10 ** decimals) / 10 ** decimals))}>Max {num(max, decimals)}</button>}
      </div>
      <div className="hk-amt-in">
        <input id={id} inputMode="decimal" autoComplete="off" placeholder="0" value={value} onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)} style={{width: `${Math.max(1, String(value || '0').length) + 0.6}ch`}}/>
        <span>{unit}</span>
      </div>
      {sub && <div className="hk-amt-sub">{sub}</div>}
    </div>
  );
}

export function Readout({rows}) {
  return (
    <dl className="hk-read">
      {rows.map(([k, v, tone]) => <div key={k}><dt>{k}</dt><dd className={tone || ''}>{v}</dd></div>)}
    </dl>
  );
}

export function Stats({items}) {
  return (
    <section className="hk-row" style={{'--n': items.length}}>
      {items.map(([k, v, unit, tone]) => <div key={k}><Lab>{k}</Lab><div className={`n ${tone || ''}`}>{v}{unit && <small>{unit}</small>}</div></div>)}
    </section>
  );
}

const ICON = {faucet: 'drop', vault: 'vault', harvest: 'spark', collateral: 'layers', borrow: 'up', repay: 'down', lend: 'lend', price: 'market', time: 'clock', liquidation: 'bolt'};

export function Activity({log, limit = 4, empty = 'Nothing yet. What you do shows up here.', title = 'Activity', filter}) {
  const rows = (filter ? log.filter((e) => filter.includes(e.type)) : log).slice(0, limit);
  return (
    <section className="hk-act">
      <Lab>{title}</Lab>
      {rows.length === 0 ? <p className="hk-empty">{empty}</p> : (
        <ol>
          {rows.map((e) => (
            <li key={e.id} className={e.type === 'liquidation' ? 'hot' : ''}>
              <span className="when">Day {e.t}</span>
              <span className="ic"><Glyph name={ICON[e.type] || 'check'} size={13}/></span>
              <span className="what">{e.summary}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function SimFoot() {
  return <div className="hk-foot"><i className="hk-dot"/>Simulated market, no real funds</div>;
}

export function Problem({children}) {
  return children ? <p className="hk-problem" role="alert"><Glyph name="warn" size={15}/>{children}</p> : null;
}
