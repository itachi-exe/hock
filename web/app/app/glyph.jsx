// Hock icon set: one stroke style on a 24 grid. No emoji anywhere.
const P = {
  position: <><circle cx="12" cy="12" r="8"/><path d="M12 12l4.5-3"/><path d="M12 4v1.5M4 12h1.5M18.5 12H20"/></>,
  vault: <><rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="12" cy="12" r="3"/></>,
  lend: <><path d="M4 16l5-5 4 3 7-7"/><path d="M15 7h5v5"/></>,
  market: <path d="M5 19v-6m7 6V5m7 14v-9"/>,
  wallet: <><rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17"/><circle cx="16" cy="14.5" r="1"/></>,
  drop: <path d="M12 4s6 6.2 6 10.2A6 6 0 0 1 6 14.2C6 10.2 12 4 12 4Z"/>,
  clock: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></>,
  reset: <><path d="M5 12a7 7 0 1 0 2.2-5.1"/><path d="M5 5v4h4"/></>,
  warn: <><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 10v4m0 3v.01"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  up: <path d="M12 19V5m-6 6 6-6 6 6"/>,
  down: <path d="M12 5v14m-6-6 6 6 6-6"/>,
  spark: <><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/><circle cx="12" cy="12" r="2"/></>,
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z"/>,
  layers: <><path d="m12 4 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/></>,
};
export function Glyph({name, size = 20, ...rest}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{P[name]}</svg>;
}

export function Mark({size = 26}) {
  return <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="7" stroke="currentColor" strokeWidth="1.4"/><path d="M8 7v12M18 7v12M8 13h10" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

export function PairIcon() {
  return (
    <span className="hk-pair" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="#1b2520" stroke="#c7c8c4"/><path d="M10 7v12M10 8h4.5a2.5 2.5 0 010 5H10h5a2.8 2.8 0 010 5.6H10M12 5.5v2M12 18.5v2" stroke="#f5f5f3" strokeWidth="1.4" fill="none"/></svg>
      <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="#111914" stroke="#6cc09c"/><path d="M7.5 17V9l5.5 6 5.5-6v8" stroke="#6cc09c" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
    </span>
  );
}
