export const SCENARIO = Object.freeze({minValue:100,maxValue:1000000,minLtv:10,maxLtv:75,exampleLltv:80,initialValue:'10000',initialLtv:40});
export function evaluateScenario(rawValue, rawLtv) {
  if (typeof rawValue !== 'string' || !/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(rawValue.trim())) return {ok:false,error:'Enter a collateral value with up to 2 decimals.'};
  const value = Number(rawValue);
  const ltv = Number(rawLtv);
  if (!Number.isFinite(value) || value < SCENARIO.minValue || value > SCENARIO.maxValue) return {ok:false,error:'Use a value from 100 to 1,000,000 MUSD.'};
  if (!Number.isFinite(ltv) || !Number.isInteger(ltv) || ltv < SCENARIO.minLtv || ltv > SCENARIO.maxLtv) return {ok:false,error:'Choose a borrowing ratio from 10% to 75%.'};
  const debt = value * ltv / 100;
  const exampleLimit = value * SCENARIO.exampleLltv / 100;
  return {ok:true,value,ltv,debt,exampleLimit,headroom:exampleLimit-debt,healthFactor:SCENARIO.exampleLltv/ltv,highRisk:ltv>=65};
}
export function formatAmount(value) { return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value); }
