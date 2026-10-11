import {AIRCRAFT,LOADS,initialLoading,evaluateLoading,moveLoad,initialPitchMoment,suggestedMove} from '../systems/loading.js';
const $=s=>document.querySelector(s), text=(s,v)=>{$(s).textContent=v;};
let loads=initialLoading(), mode='challenge', started=false, disturbed=false, saved={A:null,B:null}, persistent=true;
const key='space-race-loading-v1';
function valid(t){try {return t?.model==='fictional-loading-v1' && ['challenge','free'].includes(t.mode) && !!evaluateLoading(t.loads);}catch{return false;}}
try {const old=JSON.parse(localStorage.getItem(key)||'{}');for(const slot of ['A','B'])if(valid(old[slot]))saved[slot]=old[slot];}catch{persistent=false;}
for(const [id,d] of Object.entries(LOADS)) {
  const rail=document.createElement('div');rail.className='load-rail';rail.dataset.rail=id;
  for(const x of d.stations){const tick=document.createElement('i');tick.className='rail-station';tick.style.left=`${10+80*x/6}%`;rail.append(tick);}
  const chip=document.createElement('button');chip.type='button';chip.className='load-chip';chip.dataset.id=id;chip.textContent=d.label;chip.setAttribute('aria-label',`Move ${d.label.toLowerCase()}; use left and right arrow keys`);rail.append(chip);$('[data-rails]').append(rail);
  const field=document.createElement('fieldset');field.className='load-control';
  field.innerHTML=`<legend>${d.label}</legend><label for="${id}-station">${d.label} station</label><select id="${id}-station">${d.names.map((name,i)=>`<option value="${i}">${name} · ${d.stations[i].toFixed(2)} m</option>`).join('')}</select><div data-mass-control="${id}" hidden><label for="${id}-mass">${d.label} mass <output id="${id}-output"></output></label><input type="range" id="${id}-mass" min="0" max="${d.max}" step="5" value="${d.mass}"></div>`;
  $('[data-controls]').append(field);
  $(`#${id}-station`).addEventListener('change',e=>move(id,+e.target.value));
  $(`#${id}-mass`).addEventListener('input',e=>{if(mode!=='free')return;loads[id].mass=+e.target.value;text('[data-move-note]','Mass changed in free exploration. Compare a saved trial to separate mass changes from position changes.');render();});
  chip.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();move(id,e.key==='Home'?0:e.key==='End'?2:Math.max(0,Math.min(2,loads[id].station+(e.key==='ArrowLeft'?-1:1))));}});
  let pointer=null;
  chip.addEventListener('pointerdown',e=>{if(chip.disabled||!e.isPrimary)return;pointer=e.pointerId;chip.setPointerCapture(pointer);});
  chip.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const r=rail.getBoundingClientRect(),arm=((e.clientX-r.left)/r.width-.1)*6/.8;const next=d.stations.reduce((best,x,i)=>Math.abs(x-arm)<Math.abs(d.stations[best]-arm)?i:best,0);if(next!==loads[id].station)move(id,next);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])chip.addEventListener(event,()=>{pointer=null;});
}
function move(id,station){if(mode==='challenge'&&!started)return;const before=evaluateLoading(loads);loads=moveLoad(loads,id,station);const after=evaluateLoading(loads),delta=after.cg-before.cg;text('[data-move-note]',`${LOADS[id].label} moved to ${LOADS[id].names[station].toLowerCase()}. Mass stays ${after.mass.toFixed(0)} kg. CG moves ${Math.abs(delta*100).toFixed(1)} cm ${delta<0?'towards the nose':delta>0?'towards the tail':'(no shift)'}.`);text('[data-hint-text]','');render();}
function tableRow(values){const row=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;row.append(td);}return row;}
function render(){
  const r=evaluateLoading(loads), locked=mode==='challenge'&&!started;
  text('[data-mass]',`${r.mass.toFixed(0)} kg`);text('[data-cg]',`${r.cg.toFixed(3)} m`);text('[data-payload]',`${r.payload.toFixed(0)} kg`);
  text('[data-scene-summary]',`${r.mass.toFixed(0)} kg total · CG ${r.cg.toFixed(3)} m · payload ${r.payload.toFixed(0)} kg`);
  $('[data-cg-marker]').style.left=`${10+80*(r.cg-1.8)/1.6}%`;
  const messages={aft:`Too far aft by ${((r.cg-AIRCRAFT.aft)*100).toFixed(1)} cm. The rear hold is not a bottomless pit.`,forward:`Too far forward by ${((AIRCRAFT.forward-r.cg)*100).toFixed(1)} cm. Try moving a load aft.`,overweight:`${(r.mass-AIRCRAFT.maxMass).toFixed(0)} kg over the fictional mass limit. Moving things cannot fix total mass.`,payload:`Payload is ${r.payload.toFixed(0)} kg; the game asks for at least 180 kg.`};
  text('[data-feedback]',locked?'Make a prediction to begin.':r.passed?'All loading objectives met. Same cargo. Better decisions.':r.faults.map(f=>messages[f]).join(' '));$('[data-feedback]').dataset.good=String(r.passed&&!locked);
  for(const [id,d] of Object.entries(LOADS)){
    const p=loads[id],chip=$(`[data-id="${id}"]`);chip.disabled=locked;chip.style.left=`${10+80*d.stations[p.station]/6}%`;chip.title=`${d.label}: ${p.mass} kg at ${d.stations[p.station]} m`;chip.setAttribute('aria-label',`${d.label}, ${p.mass} kg, ${d.names[p.station]}, ${d.stations[p.station]} metres. Left/right moves station.`);
    $(`#${id}-station`).value=p.station;$(`#${id}-station`).disabled=locked;$(`[data-mass-control="${id}"]`).hidden=mode!=='free';$(`#${id}-mass`).value=p.mass;text(`#${id}-output`,`${p.mass} kg`);
  }
  document.querySelectorAll('[data-save],[data-hint],[data-pitch]').forEach(b=>b.disabled=locked);
  $('[data-prediction]').hidden=mode==='free'||started;
  text('[data-mode-label]',mode==='challenge'?'Locked masses · challenge':'Adjustable masses · free');
  text('[data-brief]',mode==='challenge'?'Keep all 180 kg of payload and 80 kg of fuel. Rearrange the loads to put CG inside 2.35–2.60 m from the nose datum. Maximum mass: 1,100 kg.':'Explore freely: change mass or station. The same fictional 180 kg payload objective, 1,100 kg mass limit and 2.35–2.60 m CG band remain visible for comparison.');
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  const rows=[{label:'Empty aircraft',mass:700,arm:2.4,moment:1680},{label:'Pilot',mass:80,arm:1.8,moment:144},...r.rows];
  $('[data-moments]').replaceChildren(...rows.map(p=>tableRow([p.label,p.mass.toFixed(0),p.arm.toFixed(2),p.moment.toFixed(1)])));
  text('[data-math]',`Σ(mx) = ${r.moment.toFixed(1)} kg·m. Σm = ${r.mass.toFixed(0)} kg. CG = ${r.moment.toFixed(1)} / ${r.mass.toFixed(0)} = ${r.cg.toFixed(3)} m.`);
  if(disturbed){const cm=initialPitchMoment(r.cg),direction=Math.abs(cm)<1e-10?'neutral':cm<0?'nose down':'nose up';text('[data-pitch-result]',`For this assumed +5° disturbance, ΔCₘ = ${cm.toFixed(4)}: ${direction}${cm<0?' — an initial restoring tendency.':cm>0?' — the disturbance initially grows.':' — no initial restoring tendency.'} Static margin ${(r.staticMargin*100).toFixed(1)}% of the assumed chord. Loading limits and static stability are separate checks.`);text('[data-pitch-arrow]',cm<0?'↶ Initial tendency: nose down':cm>0?'↷ Initial tendency: nose up':'— Neutral initial tendency');}
  else {text('[data-pitch-result]','No disturbance applied.');text('[data-pitch-arrow]','');}
  compare();
}
function compare(){const body=$('[data-trials]');body.replaceChildren();for(const slot of ['A','B']){const t=saved[slot];if(!t){body.append(tableRow([slot,'Not saved','—','—','—','—']));continue;}const r=evaluateLoading(t.loads);const config=Object.entries(LOADS).map(([id,d])=>`${d.label}: ${t.loads[id].mass} kg @ ${d.stations[t.loads[id].station]} m`).join('; ');body.append(tableRow([slot,`${t.mode} · ${config}`,`${r.mass} kg`,`${r.cg.toFixed(3)} m`,`${r.payload} kg`,r.passed?'Objectives met':r.faults.join(', ')]));}text('[data-storage]',persistent?'A/B are saved in this browser. Reset keeps them; Clear removes a slot.':'Storage unavailable: A/B are kept for this visit only.');}
function persist(){try{localStorage.setItem(key,JSON.stringify(saved));}catch{persistent=false;}compare();}
document.querySelectorAll('[data-guess]').forEach(b=>b.addEventListener('click',()=>{started=true;text('[data-move-note]',`Your prediction: ${b.textContent}. Try moving the baggage to the centre hold and watch the numbers.`);render();$('[data-id="baggage"]').focus();}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(mode===b.dataset.mode)return;mode=b.dataset.mode;loads=initialLoading();started=false;disturbed=false;text('[data-move-note]','');text('[data-hint-text]','');render();}));
$('[data-reset]').addEventListener('click',()=>{loads=initialLoading();started=false;disturbed=false;text('[data-move-note]','');text('[data-hint-text]','');render();$(mode==='challenge'?'[data-guess]':'[data-id="baggage"]').focus();});
$('[data-hint]').addEventListener('click',()=>{if(evaluateLoading(loads).passed){text('[data-hint-text]','You already meet every loading objective. Save this arrangement before experimenting further.');return;}const hint=suggestedMove(loads);text('[data-hint-text]',hint?`Try ${LOADS[hint.id].label.toLowerCase()} → ${LOADS[hint.id].names[hint.station].toLowerCase()}. CG would move ${Math.abs(hint.shift*100).toFixed(1)} cm ${hint.shift<0?'forward':'aft'}, to ${hint.cg.toFixed(3)} m, with the same ${hint.mass} kg total mass. ${hint.passed?'That meets the objectives.':'Other constraints may still need work.'}`:'No single station move gets CG closer to the middle of the band. Check total mass and payload separately.');});
$('[data-pitch]').addEventListener('click',()=>{disturbed=true;render();});
document.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',()=>{saved[b.dataset.save]={model:'fictional-loading-v1',mode,loads:structuredClone(loads)};persist();}));
document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>{saved[b.dataset.clear]=null;persist();}));
render();
