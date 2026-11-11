'use client';
import {useState} from 'react';
import {PARAMS} from '../../engine.mjs';
import {Glyph} from '../glyph';
import {Activity, AreaChart, BigInput, Lab, Money, Orb, Problem, RangeTabs, Readout, Seg, SimFoot, Stats, parse, useSeries} from '../parts';
import {num, pct, useMarket, usd} from '../market-context';

function AddMode() {
  const {view, act, preview} = useMarket();
  const price = view.prices.btcInMusd;
  const [btc, setBtc] = useState('');
  const n = parse(btc), musd = n > 0 ? Math.round(n * price * 100) / 100 : 0;
  const maxBtc = Math.max(0, Math.min(view.wallet.btc, view.wallet.musd / price));
  const pv = preview({type: 'vaultDeposit', btc: n, musd});
  const minted = pv.ok ? pv.view.wallet.shares - view.wallet.shares : 0;
  if (view.wallet.btc <= 0 && view.wallet.musd <= 0) {
    return (
      <>
        <div className="hk-amt"><Lab>You add</Lab><div className="hk-amt-in"><b>0</b><span>BTC</span></div></div>
        <p className="hk-hint">Your demo wallet is empty. Fund it to add liquidity.</p>
        <button type="button" className="hk-btn" onClick={() => act({type: 'faucet'}, 'Demo funds added to your wallet')}>Get demo funds</button>
      </>
    );
  }
  return (
    <>
      <BigInput label="You add" unit="BTC" decimals={4} value={btc} onChange={setBtc} max={maxBtc} sub={n > 0 ? `+ ${num(musd, 2)} MUSD matched from wallet` : 'The MUSD side is matched for you.'}/>
      <Problem>{btc !== '' && !pv.ok ? pv.error : null}</Problem>
      <button type="button" className="hk-btn" disabled={!pv.ok} onClick={() => { const r = act({type: 'vaultDeposit', btc: n, musd}, `Received ${num(minted, 2)} vault shares`); if (r.ok) setBtc(''); }}>{pv.ok ? `Add ${num(n, 4)} BTC to vault` : 'Enter an amount'}</button>
      <Readout rows={[
        ['You receive', pv.ok ? `${num(minted, 2)} shares` : 'None'],
        ['Worth', usd(minted * view.vault.sharePrice, 0)],
        ['Earning', pv.ok ? `${usd(minted * view.vault.sharePrice * view.vault.emissionApr * (1 - PARAMS.vault.feeRate), 0)} / yr` : 'None', 'ok'],
      ]}/>
    </>
  );
}

function WithdrawMode() {
  const {view, act, preview} = useMarket();
  const [v, setV] = useState('');
  const n = parse(v);
  const pv = preview({type: 'vaultWithdraw', shares: n});
  const back = pv.ok ? {btc: pv.view.wallet.btc - view.wallet.btc, musd: pv.view.wallet.musd - view.wallet.musd} : null;
  return (
    <>
      <BigInput label="You withdraw" unit="shares" value={v} onChange={setV} max={view.wallet.shares} sub={view.position.collateralShares > 0 ? 'Shares posted as collateral come out on Position first.' : `${num(view.wallet.shares, 2)} shares in wallet`}/>
      <Problem>{v !== '' && !pv.ok ? pv.error : null}</Problem>
      <button type="button" className="hk-btn" disabled={!pv.ok} onClick={() => { const r = act({type: 'vaultWithdraw', shares: n}, 'Liquidity returned to your wallet'); if (r.ok) setV(''); }}>{pv.ok ? `Withdraw ${num(n, 2)} shares` : view.wallet.shares > 0 ? 'Enter an amount' : 'No shares in wallet'}</button>
      <Readout rows={[
        ['BTC back', back ? num(back.btc, 4) : 'None'],
        ['MUSD back', back ? num(back.musd, 2) : 'None'],
      ]}/>
    </>
  );
}

export default function VaultPage() {
  const {view, state, history, act, preview} = useMarket();
  const v = view.vault;
  const [range, setRange] = useState(Infinity);
  const [mode, setMode] = useState('add');
  const series = useSeries(history, 'sp', range);
  const since = view.t - state.vault.lastHarvest;
  const hv = preview({type: 'harvest'});
  const stake = view.wallet.shareValue + view.position.collateralValue;
  const net = v.pendingRewards * (1 - PARAMS.vault.feeRate);
  return (
    <div className="hk-wrap">
      <main id="main" className="hk-main">
        <section className="hk-hero">
          <div className="hk-hero-l">
            <Lab as="h1">Vault value</Lab>
            <div className="hk-big"><Money value={v.tvl} d={0}/></div>
            <div className="hk-delta"><span>Share price <b>{v.sharePrice.toFixed(4)}</b></span><span>MEZO {pct(v.emissionApr, 0)} a year</span><span>Your stake {usd(stake, 0)}</span></div>
            {series.length > 1 ? <><AreaChart points={series} label="Vault share price over simulated days"/><RangeTabs value={range} onChange={setRange}/></> : <p className="hk-hint chart">Share price starts at 1.0000 and rises each time rewards are harvested. Move time forward from the wallet menu to watch it grow.</p>}
          </div>
          <Orb fill={Math.min(1, since / 30)} tone="safe" label="Waiting to harvest" value={usd(v.pendingRewards, 0)} sub={`${since} day${since === 1 ? '' : 's'} since last harvest`} aria={`${usd(v.pendingRewards, 0)} waiting to harvest`}/>
        </section>
        <section className="hk-strip" aria-label="Harvest and compound">
          <ol className="hk-flow">
            <li><b>1</b>Vault earns MEZO</li>
            <li><b>2</b>Harvest sells it into liquidity</li>
            <li><b>3</b>Share price rises, {pct(PARAMS.vault.feeRate, 0)} to treasury</li>
          </ol>
          {hv.ok
            ? <button type="button" className="hk-sm" onClick={() => act({type: 'harvest'}, 'Rewards compounded into the vault')}><Glyph name="spark" size={14}/>Harvest {usd(net, 0)}</button>
            : <button type="button" className="hk-sm quiet" onClick={() => act({type: 'advance', days: 30}, 'Moved 30d ahead')}><Glyph name="clock" size={14}/>Skip 30 days</button>}
        </section>
        <Stats items={[
          ['Share price', v.sharePrice.toFixed(4)],
          ['MEZO rewards', (v.emissionApr * 100).toFixed(0), '%'],
          ['Harvest fee', (PARAMS.vault.feeRate * 100).toFixed(0), '%'],
          ['Treasury', usd(v.treasury, 0)],
        ]}/>
        <Activity log={view.log} limit={4} filter={['vault', 'harvest', 'collateral']} empty="No vault activity yet."/>
      </main>
      <aside className="hk-side" aria-label="Vault panel">
        <Seg label="Vault action" value={mode} onChange={setMode} options={[['add', 'Add'], ['withdraw', 'Withdraw']]}/>
        <div className="hk-panel" key={mode}>{mode === 'add' ? <AddMode/> : <WithdrawMode/>}</div>
        <SimFoot/>
      </aside>
    </div>
  );
}
