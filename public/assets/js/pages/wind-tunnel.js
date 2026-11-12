import { mountWindTunnel, mountPolar } from '../experiences/wind-tunnel.js';
import { coefficients, bestLD, reynolds } from '../systems/aerofoil.js';
import { atmosphere } from '../systems/atmosphere.js';
import { parseVerifiedDataset, objectives, evaluateMeasured, verdict, createTrialStore } from '../systems/wing-challenge.js';
const $ = s => document.querySelector(s);
const text = (s,v) => { $(s).textContent = v; };
const show = (s,v) => { $(s).hidden = !v; };
const defaults = () => ({alpha:4,speed:60,wing:{camber:.02,camberPos:.4,thickness:.12,aspectRatio:8,oswald:.8}});
const section = () => ({camber:0,camberPos:.4,thickness:.12,aspectRatio:8,oswald:.8});
const state = {...defaults(),mode:'measured',stage:0,prediction:null};
let free=defaults(), dataset, goal, result, tunnel, liftPlot, dragPlot, trials;
const angle=$('#wing-angle'), measured=()=>state.mode==='measured';
function curveFor(t) { return t.mode==='measured' ? dataset.samples : Array.from({length:113},(_,i)=>({alpha:-6+i*.25,...coefficients(-6+i*.25,t.wing)})); }
function evaluate(t) { return t.mode==='measured' ? evaluateMeasured(dataset,t.alpha) : {alpha:t.alpha,...coefficients(t.alpha,t.wing),mode:'theory',datasetId:'theory-v1'}; }
function validTrial(t) {
  if(!t || !Number.isFinite(t.alpha) || !['measured','theory'].includes(t.mode)) return false;
  if(t.mode==='measured') return !!dataset && t.datasetId===dataset.id && t.alpha>=dataset.samples[0].alpha && t.alpha<=dataset.samples.at(-1).alpha;
  const w=t.wing;
  return t.datasetId==='theory-v1' && t.alpha>=-6 && t.alpha<=22 && Number.isFinite(t.speed) && t.speed>=15 && t.speed<=120 && w && [w.camber,w.camberPos,w.thickness,w.aspectRatio,w.oswald].every(Number.isFinite) && w.camber>=0 && w.camber<=.06 && w.camberPos===.4 && w.thickness>=.06 && w.thickness<=.2 && w.aspectRatio>=3 && w.aspectRatio<=30 && w.oswald>=.7 && w.oswald<=.85;
}
function sync() {
  angle.min=measured()?dataset.samples[0].alpha:-6; angle.max=measured()?dataset.samples.at(-1).alpha:22; angle.value=state.alpha;
  for(const [name,v] of Object.entries({speed:state.speed,aspect:state.wing.aspectRatio,camber:state.wing.camber*100,thickness:state.wing.thickness*100})) $(`lab-control[name="${name}"]`).value=v;
}
const feedback={
  insufficient:['Insufficient lift. A little more tilt?','You are below the game’s lift target. Follow the rising branch of this measured curve; the target is 70% of its positive peak.'],
  'beyond-peak':['Beyond the measured lift peak. More tilt has stopped helping.','The largest sampled lift coefficient is at 17.13°. The next sample drops sharply. NPTEL explains how near-surface flow can lose the momentum it needs to oppose an adverse pressure gradient and separate (Flight Lecture 15, PDF pp. 2–11). The moving wake illustrates that idea; it is not measured flow or a CFD solution.'],
  'excessive-drag':['Enough lift. Excessive drag. Back off the angle a little.','You cleared the lift requirement, but you are paying more drag than this game allows. Move back towards the first point that reaches the lift target. This is a game objective, not an aircraft operating limit.'],
  reached:['Target reached. That wing is doing its job.','This point meets the lift target on the rising branch. Now see how much drag you can avoid while keeping at least that much lift.']
};
function refresh() {
  result=evaluate(state);
  const air=atmosphere(0), q=.5*air.rho*state.speed**2;
  for(const [k,v] of Object.entries({cl:result.cl,cd:result.cd,ld:result.ld,lift:q*16*result.cl/1000,drag:q*16*result.cd/1000,re:measured()?6:reynolds(state.speed,1.5,air.rho)/1e6})) $(`[data-out="${k}"]`).value=v;
  $('[data-out="cl"]').setState(result.stalled?'bad':'good');
  text('#angle-output',`${state.alpha.toFixed(2)}°`);
  angle.setAttribute('aria-valuetext',`${state.alpha.toFixed(2)} degrees; lift coefficient ${result.cl.toFixed(4)}; drag coefficient ${result.cd.toFixed(5)}`);
  text('[data-result-label]',measured()?'Measured section · linear interpolation':'Theoretical wing · not measurements');
  text('[data-tunnel-status]',measured()?(result.stalled?'Beyond measured peak':'At / before measured peak'):(result.stalled?'Model stall':'Model pre-stall'));
  text('[data-margin]',measured()?'Measured range −4.04° to 19.08°. Peak sample: Cₗ 1.6116 at 17.13°. No extrapolation.':`Theoretical stall at ${result.alphaStallDeg.toFixed(1)}°. Forces assume sea level and 16 m²; Reynolds uses 1.5 m chord. Thickness changes the drawing, not these coefficients.`);
  text('#plot-summary',`${measured()?'Measured section':'Theoretical wing'}: at ${state.alpha.toFixed(2)}°, Cₗ ${result.cl.toFixed(4)}, Cᴅ ${result.cd.toFixed(5)}, L/D ${result.ld.toFixed(1)}. ${measured()?'The lift curve peaks at 17.13°, then falls to 0.9967 at 18.02°.':'Current curves use the adjustable finite-wing model with an illustrative stall blend.'} ${$('#drag-zoom').checked?'Drag axis zoomed to 0–0.03; higher values are clipped. ':''}Saved trial values are in the table below. Dashed horizontal lines are game objectives.`);
  text('[data-live-goal]',measured() && state.stage ? `Stage ${state.stage} · Cₗ ≥ ${goal.liftTarget.toFixed(5)}${state.stage===2?` · Cᴅ ≤ ${goal.dragLimit.toFixed(7)}`:''} · stay at or before 17.13°` : 'Start with your prediction above.');
  show('[data-next]',false);
  delete $('[data-feedback]').dataset.good;
  if(measured() && state.stage) {
    const code=verdict(result,goal,state.stage), [headline,why]=feedback[code];
    text('[data-feedback]',code==='reached' && state.stage===2?'Both targets reached. Same lift requirement. Less drama.':headline);
    // Same flag loading.js sets, so a miss is amber instead of success green.
    $('[data-feedback]').dataset.good=String(code==='reached');
    text('[data-why]',code==='reached' && state.stage===2?'You kept lift at or above the target and drag within 110% of the minimum that satisfies it on the rising branch. That margin is our game setting. Save this trial and compare it with a steeper angle.':why);
    show('[data-next]',state.stage===1 && code==='reached');
  }
  const best=bestLD(state.wing);
  text('[data-best-ld]',measured()?'Switch to Explore freely to investigate aspect ratio with the theoretical finite-wing model. Section drag here does not include a finite wing’s induced drag.':`This theoretical wing reaches its best model L/D of ${best.ld.toFixed(1)} near ${best.alpha.toFixed(1)}°. These are illustrative results, not a flight manual.`);
  tunnel?.stage.renderOnce(); liftPlot?.stage.renderOnce(); dragPlot?.stage.renderOnce();
}
function updateMode() {
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
  show('[data-mission]',measured()); show('[data-live]',measured()); show('[data-free-controls]',!measured());
  for(const k of ['lift','drag']) show(`[data-out="${k}"]`,!measured());
  text('[data-source]',measured()?'LOCKED TEST · NACA 0012 airfoil section · Re 6,000,000 · Mach 0.15 · transition tripped, 80 grit. Ladson / NASA TM 4074. Between samples: linear interpolation. This is not whole-aircraft performance.':`${dataset?'':'Measured challenge unavailable: the experimental data could not be verified. '}FREE EXPLORATION · Adjustable theoretical finite-wing model. Current results are not measurements. Presets are illustrative, not specifications of named aircraft.`);
  angle.disabled=measured() && !state.stage;
  document.querySelectorAll('[data-save]').forEach(b=>b.disabled=angle.disabled);
  sync(); refresh();
}
function setAngle(v) { if(angle.disabled)return; state.alpha=Math.round(Math.max(+angle.min,Math.min(+angle.max,v))*100)/100; angle.value=state.alpha; refresh(); }
angle.addEventListener('input',()=>setAngle(+angle.value));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.mode===state.mode)return;
  if(!measured()) free={alpha:state.alpha,speed:state.speed,wing:{...state.wing}};
  state.mode=b.dataset.mode;
  Object.assign(state,measured()?{alpha:4,speed:60,wing:section()}:{...free,wing:{...free.wing}}); updateMode();
}));
document.querySelectorAll('[data-prediction]').forEach(b=>b.addEventListener('click',()=>{
  state.prediction=b.dataset.prediction; state.stage=1;
  text('[data-prediction-note]',`Your prediction: ${b.textContent} Let the measurements answer.`); show('[data-predictions]',false);
  text('[data-step]','Challenge 1 / 2 · find the lift'); text('[data-objective]','Make the wing earn its place here.');
  text('[data-goal]',`Game objective: Cₗ ≥ ${goal.liftTarget.toFixed(5)} on the rising branch (at or before 17.13°). That is 70% of the measured positive peak.`); updateMode(); angle.focus();
}));
$('[data-next]').addEventListener('click',()=>{
  state.stage=2; text('[data-step]','Challenge 2 / 2 · stop wasting drag'); text('[data-objective]','Keep the lift. Lose the unnecessary drag.');
  text('[data-goal]',`Game objectives: Cₗ ≥ ${goal.liftTarget.toFixed(5)}, Cᴅ ≤ ${goal.dragLimit.toFixed(5)}, on the rising branch. Drag allowance = 110% of the lowest drag meeting the lift target.`); refresh(); angle.focus();
});
$('[data-reset]').addEventListener('click',()=>{
  if(measured()) {
    state.alpha=4; state.stage=0; state.prediction=null; show('[data-predictions]',true);
    text('[data-step]','Before you touch the wing'); text('[data-objective]','Keep tilting the wing. Does lift keep increasing?');
    text('[data-prediction-note]',''); text('[data-goal]',''); text('[data-feedback]','Choose a prediction to begin.'); text('[data-why]','Make a prediction, then tilt the wing and watch the measured curve.');
  } else { free=defaults(); Object.assign(state,defaults()); }
  updateMode();
  if(measured())$('[data-prediction]').focus();else angle.focus();
});
document.addEventListener('lab-input',e=>{
  if(measured())return; const {name,value}=e.detail;
  if(name==='speed')state.speed=value;
  else { const f={aspect:'aspectRatio',camber:'camber',thickness:'thickness'}[name]; if(f)state.wing[f]=name==='aspect'?value:value/100; }
  refresh();
});
const presets={airliner:[3,.02,.12,9,.8],glider:[5,.03,.11,26,.85],fighter:[6,0,.06,3,.7],stall:[18,.02,.12,8,.8]};
document.querySelectorAll('[data-wing-preset]').forEach(b=>b.addEventListener('click',()=>{
  if(measured())return; const [alpha,camber,thickness,aspectRatio,oswald]=presets[b.dataset.wingPreset];
  Object.assign(state,{alpha,wing:{camber,camberPos:.4,thickness,aspectRatio,oswald}}); sync(); refresh();
}));
function compare() {
  const body=$('[data-trials]'); body.replaceChildren();
  for(const slot of ['A','B']) {
    const t=trials.trials[slot], row=document.createElement('tr'); row.dataset.slot=slot;
    let cells=[slot,'Not saved yet','—','—','—','—'];
    if(t) { const r=evaluate(t); cells=[slot,t.mode==='measured'?'Measured · NACA 0012 · Re 6m · M 0.15 · 80 grit':`Theory · AR ${t.wing.aspectRatio} · camber ${(t.wing.camber*100).toFixed(1)}% · thickness ${(t.wing.thickness*100).toFixed(1)}% · e ${t.wing.oswald} · ${t.speed} m/s`,`${t.alpha.toFixed(2)}°`,r.cl.toFixed(4),r.cd.toFixed(5),r.ld.toFixed(1)]; }
    cells.forEach((v,i)=>{ const cell=document.createElement(i?'td':'th'); if(!i)cell.scope='row'; cell.textContent=v; row.append(cell); }); body.append(row);
  }
  text('[data-plot-trials]',Object.entries(trials.trials).map(([slot,t])=>`${slot}: ${t?(t.mode==='measured'?'measured NACA 0012 section':'theoretical finite wing'):'not saved'}`).join(' · '));
  text('[data-storage]',trials.persistent?'Trials save in this browser. Reset keeps A and B; Clear removes a slot.':'Browser storage is unavailable. A and B stay for this visit only.'); refresh();
}
document.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',()=>{ trials.save(b.dataset.save,{mode:state.mode,datasetId:result.datasetId,alpha:state.alpha,speed:state.speed,wing:{...state.wing}}); compare(); }));
document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{trials.save(b.dataset.clear,null);compare();}));
const canvas=$('#tunnel-canvas'); let drag;
canvas.addEventListener('pointerdown',e=>{if(angle.disabled || !e.isPrimary)return;drag={id:e.pointerId,y:e.clientY,alpha:state.alpha};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)setAngle(drag.alpha+(drag.y-e.clientY)*.1);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
const startupButtons=[...document.querySelectorAll('#tunnel button')]; startupButtons.forEach(b=>b.disabled=true);
try { const response=await fetch('/assets/data/naca0012-ladson.json'); if(!response.ok)throw new Error('Dataset unavailable'); dataset=await parseVerifiedDataset(await response.text()); goal=objectives(dataset.samples); }
catch { dataset=null; $('[data-mode="measured"]').disabled=true; state.mode='theory'; }
startupButtons.forEach(b=>b.disabled=false); $('[data-mode="measured"]').disabled=!dataset;
let storage; try {storage=window.localStorage;} catch {storage=null;}
trials=createTrialStore(storage,validTrial);
if(measured())state.wing=section(); updateMode();
tunnel=mountWindTunnel(canvas,{getState:()=>state,getEvaluation:()=>result});
$('#drag-zoom').addEventListener('change',refresh);
const options={getZoom:()=>$('#drag-zoom').checked,getState:()=>state,getEvaluation:()=>result,getCurve:()=>curveFor(state),getTrials:()=>Object.entries(trials.trials).filter(([,t])=>t).map(([slot,t])=>({slot,curve:curveFor(t),result:evaluate(t)})),getTarget:metric=>measured() && state.stage?(metric==='cl'?goal.liftTarget:state.stage===2?goal.dragLimit:null):null};
liftPlot=mountPolar($('#polar-canvas'),{...options,metric:'cl'}); dragPlot=mountPolar($('#drag-canvas'),{...options,metric:'cd'}); compare();
document.querySelectorAll('.reveal').forEach(el=>el.classList.add('is-in'));
