'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ChainProvider, useChain} from './chain-context';
import {useEffect, useRef, useState} from 'react';
import {Glyph, Mark} from './glyph';
import {MarketProvider, num, useMarket, usd} from './market-context';

const NAV = [
  {href: '/app/', label: 'Position', icon: 'position', match: ['/app', '/app/borrow']},
  {href: '/app/vault/', label: 'Vault', icon: 'vault', match: ['/app/vault']},
  {href: '/app/lend/', label: 'Lend', icon: 'lend', match: ['/app/lend']},
  {href: '/app/market/', label: 'Market', icon: 'market', match: ['/app/market']},
];
const norm = (p) => (p.length > 1 ? p.replace(/\/$/, '') : p);

function DemoMenu({onClose}) {
  const {view, act} = useMarket();
  const [confirm, setConfirm] = useState(false);
  const w = view.wallet;
  return (
    <div className="hk-menu" role="dialog" aria-label="Demo wallet">
      <div className="hk-menu-head"><span className="hk-av lg">DW</span><div><b>Demo wallet</b><span>Simulated, no keys</span></div><button type="button" className="hk-x" onClick={onClose} aria-label="Close"><Glyph name="close" size={16}/></button></div>
      <dl className="hk-bal">
        <div><dt>BTC</dt><dd>{num(w.btc, 4)}</dd></div>
        <div><dt>MUSD</dt><dd>{num(w.musd, 2)}</dd></div>
        <div><dt>Vault shares</dt><dd>{num(w.shares, 2)}</dd></div>
      </dl>
      <button type="button" className="hk-btn" disabled={view.faucetLeft <= 0} onClick={() => act({type: 'faucet'}, 'Demo funds added to your wallet')}>
        {view.faucetLeft > 0 ? `Get demo funds (${view.faucetLeft} left)` : 'Faucet used up'}
      </button>
      <div className="hk-time">
        <div><Glyph name="clock" size={15}/>Day {view.t}</div>
        <div className="hk-chips" role="group" aria-label="Move time forward">
          {[[1, '1d'], [30, '30d'], [365, '1y']].map(([d, l]) => <button key={d} type="button" onClick={() => act({type: 'advance', days: d}, `Moved ${d === 365 ? 'a year' : l} ahead`)}>+{l}</button>)}
        </div>
      </div>
      <div className="hk-reset">
        {confirm ? (
          <><span>Start the market over?</span><button type="button" className="danger" onClick={() => { act({type: 'reset'}, 'Market reset'); setConfirm(false); onClose(); }}>Reset</button><button type="button" onClick={() => setConfirm(false)}>Keep</button></>
        ) : <button type="button" onClick={() => setConfirm(true)}><Glyph name="reset" size={14}/>Reset market</button>}
      </div>
    </div>
  );
}

function Toast() {
  const {toast, dismiss} = useMarket();
  const chain = useChain();
  const t = chain.note && (!toast || chain.note.id > toast.id) ? {kind: chain.note.kind, text: chain.note.text, id: chain.note.id, hash: chain.note.hash, close: chain.dismiss} : toast && {...toast, close: dismiss};
  return (
    <div className="hk-toast-host" aria-live="polite">
      {t && (
        <div key={t.id} className={`hk-toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Glyph name={t.kind === 'error' ? 'warn' : 'check'} size={17}/>
          <span>{t.text}{t.hash && <> <a href={chain.explorerTx(t.hash)} target="_blank" rel="noreferrer" className="hk-txl">View</a></>}</span>
          <button type="button" onClick={t.close} aria-label="Dismiss"><Glyph name="close" size={15}/></button>
        </div>
      )}
    </div>
  );
}

function Frame({children}) {
  const path = norm(usePathname() || '/app');
  const {view, ready} = useMarket();
  const [menu, setMenu] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!menu) return;
    const key = (e) => e.key === 'Escape' && setMenu(false);
    const click = (e) => { if (!e.target.closest('.hk-menu, .hk-menu-btn')) setMenu(false); };
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', click);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', click); };
  }, [menu]);
  useEffect(() => setMenu(false), [path]);
  const on = (n) => n.match.includes(path);
  const testnet = path === '/app/testnet';
  const chain = useChain();
  return (
    <div className="hk" ref={wrap}>
      <header className="hk-top">
        <Link href="/" className="hk-mark" aria-label="Hock home"><Mark/>Hock</Link>
        <nav className="hk-nav" aria-label="App">
          {NAV.map((n) => <Link key={n.href} href={n.href} className={on(n) ? 'on' : ''} aria-current={on(n) ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="hk-right">
          <div className="hk-mode" role="group" aria-label="Mode"><Link href="/app/" className={testnet ? "" : "on"}>Simulated</Link><Link href="/app/testnet/" className={testnet ? "on" : ""}>Testnet</Link></div>
          {testnet ? (chain.account ? <span className="hk-chip mono">{chain.account.slice(0, 6)}...{chain.account.slice(-4)}</span> : <button type="button" className="hk-chip mono" onClick={chain.connect}>Connect</button>) : <>
          <span className="hk-chip mono">Day {view.t}</span>
          <button type="button" className="hk-chip hk-menu-btn mono" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>{ready ? usd(view.wallet.musd, 0) : '$0'} MUSD</button></>}
          <button type="button" className="hk-av hk-menu-btn" onClick={() => setMenu((m) => !m)} aria-label="Open demo wallet" aria-expanded={menu}>DW</button>
        </div>
      </header>
      {menu && <DemoMenu onClose={() => setMenu(false)}/>}
      <div className="hk-body">{children}</div>
      <nav className="hk-tabs" aria-label="App">
        {NAV.map((n) => <Link key={n.href} href={n.href} className={on(n) ? 'on' : ''} aria-current={on(n) ? 'page' : undefined}><Glyph name={n.icon}/><span>{n.label}</span></Link>)}
        <button type="button" className={`hk-menu-btn ${menu ? 'on' : ''}`} onClick={() => setMenu((m) => !m)} aria-expanded={menu}><Glyph name="wallet"/><span>Wallet</span></button>
      </nav>
      <Toast/>
    </div>
  );
}

export default function Shell({children}) {
  return <MarketProvider><ChainProvider><Frame>{children}</Frame></ChainProvider></MarketProvider>;
}
