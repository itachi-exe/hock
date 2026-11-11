'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {createStore} from '../store.mjs';
import {view as makeView} from '../engine.mjs';

const Ctx = createContext(null);
const serverStore = createStore(null);
const HISTORY_KEY = 'hock-ui-history-v1';

// Everything the user owns in the simulated market, priced in MUSD.
export function netWorth(v) {
  const w = v.wallet, p = v.position;
  return w.btc * v.prices.btcInMusd + w.musd + w.shareValue + p.collateralValue + v.lend.supplied - p.debt;
}

// UI-only chart history: one point per simulated day, stored beside the market state.
function useHistory(ready, state, view) {
  const [hist, setHist] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!ready || loaded) return;
    try {
      const h = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(h)) setHist(h.filter((e) => e && Number.isFinite(e.t) && Number.isFinite(e.net)));
    } catch { /* broken history is dropped */ }
    setLoaded(true);
  }, [ready, loaded]);
  useEffect(() => {
    if (!loaded) return;
    const point = {t: view.t, net: netWorth(view), sp: view.vault.sharePrice, sup: view.lend.supplied};
    setHist((h) => {
      let next = state.log.length === 0 && view.t === 0 ? [] : h.filter((e) => e.t <= point.t);
      if (next.length && next[next.length - 1].t === point.t) next = [...next.slice(0, -1), point];
      else next = [...next, point];
      if (next.length > 400) next = next.slice(-400);
      try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* memory only */ }
      return next;
    });
  }, [loaded, state, view]);
  return hist;
}

export function MarketProvider({children}) {
  const [store, setStore] = useState(serverStore);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const timer = useRef(0);
  useEffect(() => {
    let s;
    try { s = createStore(window.localStorage); } catch { s = createStore(null); }
    setStore(s); setReady(true);
    return () => clearTimeout(timer.current);
  }, []);
  const state = useSyncExternalStore(store.subscribe, store.getState, serverStore.getState);
  const view = useMemo(() => makeView(state), [state]);
  const history = useHistory(ready, state, view);
  const say = useCallback((kind, text) => {
    clearTimeout(timer.current);
    setToast({kind, text, id: Date.now()});
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  const act = useCallback((action, success) => {
    const res = store.dispatch(action);
    if (res.ok) { if (success) say('ok', success); } else say('error', res.error);
    return res;
  }, [store, say]);
  const preview = useCallback((action) => store.preview(action), [store]);
  const value = useMemo(() => ({ready, state, view, history, act, preview, toast, dismiss: () => setToast(null)}), [ready, state, view, history, act, preview, toast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarket() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMarket needs MarketProvider');
  return v;
}

export const usd = (n, d = 2) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
export const num = (n, d = 2) => n.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
export const pct = (n, d = 1) => (n * 100).toFixed(d) + '%';
