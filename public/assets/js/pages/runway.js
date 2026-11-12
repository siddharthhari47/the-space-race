import {Playback} from '../systems/playback.js';
import {evaluateRunway,DEFAULT,LIMITS,MODEL} from '../systems/runway.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const key='space-race-runway-v1', reduced=matchMedia('(prefers-reduced-motion: reduce)');
const skipMotion=()=>reduced.matches||$('[data-no-motion]').checked;
let input={...DEFAULT}, mode='challenge', ready=false, completed=false, result=evaluateRunway(input), trials={}, player=null, playbackKind=null;
const labels={mass:['Total mass','kg',10],altitude:['Pressure altitude','m',100],temperature:['Air temperature','°C',1],runway:['Runway length','m',10],throttle:['Thrust setting','%',.05]};
// The feedback line was one teal for everything, so 'Runway exhausted' read
// like a pass. A result sets data-good (true/false); every other message
// clears it and shows in a neutral colour, the way loading.js does it.
const say=(message,good)=>{const el=$('[data-feedback]');el.textContent=message;if(good===undefined)delete el.dataset.good;else el.dataset.good=String(good);};
const name=r=>({airborne:'Airborne in this model',exhausted:'Runway exhausted',unable:'Unable to reach lift-off speed'})[r.outcome];
function validTrial(t){try{return t && t.model===MODEL.id && ['challenge','free'].includes(t.mode) && !!evaluateRunway(t.input);}catch{return false;}}
try{const saved=JSON.parse(localStorage.getItem(key)||'{}');for(const slot of ['A','B'])if(validTrial(saved?.[slot]))trials[slot]=saved[slot];}catch{}
function persist(){try{localStorage.setItem(key,JSON.stringify(trials));$('[data-storage]').textContent='A/B saved in this browser. Reset keeps them.';}catch{$('[data-storage]').textContent='Browser storage unavailable. A/B will last for this visit.';}}
function syncPlayback(){
 if(player&&playbackKind==='single'&&!completed&&player.status!=='complete'){
  const message=player.status==='playing'?'Rolling. Watch the remaining runway.':'Paused. Resume, scrub through the run, or show the result.';
  if($('[data-feedback]').textContent!==message)say(message);
 }
 $$('[data-transport]').forEach(bar=>{
  const active=!!player&&bar.dataset.transport===playbackKind;
  const pause=bar.querySelector('[data-pause]'),seek=bar.querySelector('[data-seek]');
  pause.disabled=!active||skipMotion();
  pause.textContent=active&&player.status==='playing'?'Pause':active&&player.status==='complete'?'Replay':'Resume';
  seek.disabled=!active;seek.max=1000;seek.value=active&&player.duration?1000*player.time/player.duration:0;seek.setAttribute('aria-valuetext',active?`${player.time.toFixed(1)} seconds of ${player.duration.toFixed(1)}`:'No replay loaded');
  bar.querySelector('[data-clock]').textContent=active?`${player.time.toFixed(1)} / ${player.duration.toFixed(1)} s · ${player.status}`:'No replay loaded';
  bar.querySelector('[data-skip]').disabled=!active||player.status==='complete';
 });
}
function stop(){if(player)player.dispose();player=null;playbackKind=null;syncPlayback();}
function launchPlayback(kind,duration,paint,done=()=>{}){
 stop();playbackKind=kind;
 player=new Playback({duration,paint:t=>{paint(t);syncPlayback();},done,changed:syncPlayback});
 if(skipMotion())player.finish();else player.start();
}

function controls(){
 $('[data-controls]').innerHTML=Object.entries(labels).map(([k,[label,unit,step]])=>`<label for="runway-${k}">${label}<output for="runway-${k}" data-value="${k}"></output><input id="runway-${k}" data-input="${k}" type="range" min="${LIMITS[k][0]}" max="${LIMITS[k][1]}" step="${step}" value="${input[k]}"></label>`).join('');
 $$('[data-input]').forEach(el=>el.addEventListener('input',()=>{stop();input[el.dataset.input]=Number(el.value);completed=false;result=evaluateRunway(input);paint(0);update();say('Conditions changed. Run the experiment to see the result.');$('[data-why]').textContent='';}));
}
function paint(t){const s=result.stateAt(t);$('[data-plane]').style.left=`${100*s.x/input.runway}%`;$('[data-plane]').style.top=t>=result.duration&&result.outcome==='airborne'?'calc(50% - 55px)':'50%';$('[data-meter]').max=input.runway;$('[data-meter]').value=s.x;$('[data-progress]').textContent=`${s.time.toFixed(1)} s · ${s.speed.toFixed(1)} m/s · ${Math.max(0,input.runway-s.x).toFixed(0)} m remaining · lift-off target ${result.target.toFixed(1)} m/s`;}
function update(){
 $$('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 $('[data-prediction]').hidden=ready;
 $('[data-brief]').textContent=mode==='challenge'?'Get airborne within 450 m while keeping at least 900 kg total mass. Pressure altitude: 1,500 m. Thrust setting: 100%. Adjust mass and temperature. These are game objectives.':'Explore the fictional model. All five controls are available; there is no payload objective.';
 for(const [k,[,unit]] of Object.entries(labels)){const el=$(`[data-input="${k}"]`);el.value=input[k];el.disabled=!ready||(mode==='challenge'&&['altitude','runway','throttle'].includes(k));$(`[data-value="${k}"]`).textContent=`${k==='throttle'?Math.round(input[k]*100):input[k]} ${unit}`;}
 $('[data-run]').disabled=!ready;$$('[data-save]').forEach(b=>b.disabled=!completed);$('[data-compare]').disabled=!(trials.A&&trials.B);plot();
}
function finish(){completed=true;paint(result.duration);let text=name(result)+'.';const good=result.outcome==='airborne'&&(mode!=='challenge'||input.mass>=900);if(mode==='challenge'&&result.outcome==='airborne')text+=input.mass>=900?' Challenge complete. You kept the mass and made the runway.':' Lift-off reached, but the game needs at least 900 kg. Keep more mass aboard.';say(text,good);$('[data-why]').textContent=result.outcome==='unable'?'The model’s thrust cannot overcome resistance all the way to lift-off speed. More runway alone cannot fix this. Try more thrust or less mass.':result.outcome==='exhausted'?`You need ${result.required.toFixed(0)} m of ground run in this model. You have ${input.runway} m. Try reducing mass or temperature, then compare trials.`:`Ground run to lift-off: ${result.required.toFixed(0)} m. ${Math.max(0,input.runway-result.required).toFixed(0)} m left. The model stops here; climb and obstacle clearance are not calculated.`;update();}
function run(){completed=false;update();say('Rolling. Watch the remaining runway.');$('[data-why]').textContent='';launchPlayback('single',result.duration,paint,finish);}
function plot(){
 const series=[...(completed?[{label:'Current',input,color:'#fff'}]:[]),...['A','B'].filter(k=>trials[k]).map(k=>({label:k,input:trials[k].input,color:k==='A'?'#66dbc5':'#ffc26d'}))];
 const xmax=Math.max(input.runway,...series.map(s=>s.input.runway)),ymax=Math.max(50,...series.map(s=>evaluateRunway(s.input).target*1.15));
 $('[data-curves]').innerHTML=series.map(s=>{const r=evaluateRunway(s.input);const pts=Array.from({length:81},(_,i)=>{const q=r.stateAt(r.duration*i/80);return `${45+540*q.x/xmax},${195-170*q.speed/ymax}`;}).join(' ');return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;}).join('')+`<text x="535" y="215">${xmax}</text><text x="10" y="30">${ymax.toFixed(0)}</text>`;
 $('[data-plot-summary]').textContent=series.length?series.map(s=>{const r=evaluateRunway(s.input);return `${s.label}: ${name(r)}, ${r.final.speed.toFixed(1)} m/s at ${r.distance.toFixed(0)} m`;}).join('. ')+'.':'Run a trial to draw the speed-versus-distance trace. White: current · cyan: A · amber: B.';
 $('[data-trials]').innerHTML=['A','B'].map(k=>{const t=trials[k];if(!t)return `<tr><th>${k}</th><td colspan="3">Not saved</td></tr>`;const r=evaluateRunway(t.input);return `<tr><th>${k}</th><td>${t.mode} · ${t.input.mass} kg · ${t.input.altitude} m · ${t.input.temperature}°C · ${t.input.runway} m runway · ${Math.round(t.input.throttle*100)}% thrust</td><td>${name(r)}${t.mode==='challenge'&&t.input.mass<900?' · below game mass target':''}</td><td>${r.required===null?'Unreachable':r.required.toFixed(0)+' m'}</td></tr>`;}).join('');
}
function reset(){stop();input={...DEFAULT};result=evaluateRunway(input);completed=false;ready=mode==='free';say(ready?'Choose your conditions and run.':'Make a prediction to begin.');$('[data-why]').textContent='';$('[data-race]').replaceChildren();paint(0);update();}
$$('[data-guess]').forEach(b=>b.addEventListener('click',()=>{ready=true;update();say('Prediction noted. Run the starting scenario, then change one thing and compare.');$('[data-run]').focus();}));
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;reset();}));
$('[data-run]').addEventListener('click',run);$('[data-reset]').addEventListener('click',()=>{reset();$(mode==='challenge'?'[data-guess]':'[data-run]').focus();});
$$('[data-save]').forEach(b=>b.addEventListener('click',()=>{trials[b.dataset.save]={model:MODEL.id,mode,input:{...input}};persist();update();}));
$('[data-clear]').addEventListener('click',()=>{stop();trials={};persist();$('[data-race]').replaceChildren();update();});
$('[data-compare]').addEventListener('click',()=>{
 const pair=['A','B'].map(k=>({key:k,r:evaluateRunway(trials[k].input),input:trials[k].input}));
 const scale=Math.max(...pair.map(t=>t.input.runway));
 $('[data-race]').innerHTML=pair.map(t=>`<p class="race-label">Trial ${t.key} · runway ${t.input.runway} m</p><div class="race-lane race-${t.key}"><span class="race-end" style="left:${t.input.runway/scale*100}%">END</span><span class="race-plane" data-racer="${t.key}"><img src="../assets/images/teaching-aircraft.svg" alt="" /></span></div><p data-race-text="${t.key}"></p>`).join('');
 const duration=Math.max(...pair.map(t=>t.r.duration));
 launchPlayback('comparison',duration,time=>{
  for(const t of pair){const s=t.r.stateAt(time);$(`[data-racer="${t.key}"]`).style.left=`${s.x/scale*100}%`;$(`[data-race-text="${t.key}"]`).textContent=`${t.key}: ${s.x.toFixed(0)} m / ${t.input.runway} m runway · ${s.speed.toFixed(1)} m/s${time>=t.r.duration?' · '+name(t.r):''}`;}
 });
});
$$('[data-transport]').forEach(bar=>{
 bar.querySelector('[data-pause]').addEventListener('click',()=>{if(!player)return;if(player.status==='playing')player.pause();else player.start();});
 bar.querySelector('[data-skip]').addEventListener('click',()=>player?.finish());
 bar.querySelector('[data-seek]').addEventListener('input',event=>player?.seek(Number(event.target.value)/1000*player.duration));
});
$('[data-no-motion]').addEventListener('change',()=>{if(skipMotion()&&player)player.finish();syncPlayback();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&player?.status==='playing')player.pause();});
reduced.addEventListener('change',()=>{if(reduced.matches&&player)player.finish();syncPlayback();});
controls();persist();reset();
