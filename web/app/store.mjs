import {initialState, reduce, view} from './engine.mjs';

export const STORAGE_KEY = 'hock-demo-market-v1';

// Saved state is accepted only when it has exactly the shape of a fresh market with finite numbers.
function sameShape(saved, fresh) {
  if (typeof fresh === 'number') return typeof saved === 'number' && Number.isFinite(saved);
  if (Array.isArray(fresh)) return Array.isArray(saved) && saved.every((e) => e && typeof e.id === 'number' && typeof e.summary === 'string');
  if (fresh && typeof fresh === 'object') {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return false;
    const keys = Object.keys(fresh);
    return Object.keys(saved).length === keys.length && keys.every((k) => k in saved && sameShape(saved[k], fresh[k]));
  }
  return false;
}

export function createStore(storage) {
  const listeners = new Set();
  const load = () => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return initialState();
      const saved = JSON.parse(raw);
      return sameShape(saved, initialState()) ? saved : initialState();
    } catch { return initialState(); }
  };
  let state = load();
  return {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch(action) {
      try { state = reduce(state, action); } catch (e) { return {ok: false, error: e.message}; }
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode or full storage: keep working in memory */ }
      listeners.forEach((fn) => fn());
      return {ok: true};
    },
    preview(action) {
      try { return {ok: true, view: view(reduce(state, action))}; } catch (e) { return {ok: false, error: e.message}; }
    },
  };
}
