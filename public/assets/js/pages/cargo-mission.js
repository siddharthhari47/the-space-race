import {MISSION,initialManifest,evaluateMission,saveAttempt,isCurrentAttempt} from '../systems/cargo-mission.js';
import {LOADS} from '../systems/loading.js';
import {Playback} from '../systems/playback.js';
import {STORAGE_KEY,emptyProgress,parseProgress,writeProgress} from '../systems/mission-storage.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const skipMotion=()=>reduced.matches||$('[data-no-motion]').checked;
let store=null;
try{store=localStorage;}catch{}
let state=emptyProgress();try{state=parseProgress(store?.getItem(STORAGE_KEY));}catch{}
let evaluation=evaluateMission(state.manifest),player=null;
const names={passenger:'Passenger',baggage:'Cargo',fuel:'Fuel'};
const faultText={overweight:'Over the 1,100 kg mass limit.',forward:'Balance point is ahead of the loading band.',aft:'Balance point is behind the loading band.',payload:'Carry at least 180 kg of payload, including the 80 kg passenger.'};
function persist(){const ok=writeProgress(store,state);$('[data-storage]').textContent=ok?'Progress and A/B are saved in this browser. Reload to continue.':'Browser storage is unavailable. Progress and A/B will last for this visit.';}
function stop(){if(player)player.dispose();player=null;transport();}
function transport(){
 const active=!!player;
 $('[data-pause]').disabled=!active||skipMotion();
 $('[data-pause]').textContent=active&&player.status==='playing'?'Pause':active&&player.status==='complete'?'Replay':'Resume';
 $('[data-finish]').disabled=!active||player.status==='complete';
 $('[data-seek]').disabled=!active;
 $('[data-seek]').value=active&&player.duration?player.time/player.duration*1000:0;
 $('[data-seek]').setAttribute('aria-valuetext',active?`${player.time.toFixed(1)} seconds of ${player.duration.toFixed(1)}`:'No replay loaded');
 $('[data-clock]').textContent=active?`${player.time.toFixed(1)} / ${player.duration.toFixed(1)} s · ${player.status}`:'No replay loaded';
}
function paint(time){const r=evaluation.runway,s=r.stateAt(time);$('[data-plane]').style.left=`${100*s.x/MISSION.airport.runway}%`;$('[data-plane]').style.top=time>=r.duration&&r.outcome==='airborne'?'calc(50% - 45px)':'50%';$('[data-distance]').value=s.x;$('[data-telemetry]').textContent=`${s.time.toFixed(1)} s · ${s.speed.toFixed(1)} m/s · ${Math.max(0,MISSION.airport.runway-s.x).toFixed(0)} m remaining · lift-off target ${r.target.toFixed(1)} m/s`;transport();}
function describeResult(r){return r.passed?'Mission complete':r.failures.includes('runway')?'Runway exhausted':'Loading objectives not met';}
function outcome(){
 const valid=isCurrentAttempt(state.attempt,state.manifest),r=evaluation;
 if(valid){$('[data-outcome]').textContent=r.passed?'Mission complete. The cargo made it. So did the aircraft.':'Balanced? Yes. Enough runway? Apparently not.';$('[data-explanation]').textContent=r.passed?`Payload aboard: ${r.loading.payload.toFixed(0)} kg (180 kg minimum). CG ${r.loading.cg.toFixed(3)} m is inside the game band. Ground run: ${r.runway.required.toFixed(0)} m, leaving ${(450-r.runway.required).toFixed(0)} m. The model stops at lift-off; it does not predict climb or range.`:`This manifest needs ${r.runway.required.toFixed(0)} m of ground run; there are 450 m available. Moving the same cargo changes CG, not total mass. Try carrying less cargo while keeping the required 180 kg payload.`;}
 else{$('[data-outcome]').textContent=state.prediction?(r.loading.passed?'Loading checks passed. The runway gets the final say.':'Fix the loading checks before the runway attempt.'):'Make a prediction, then check your loading.';$('[data-explanation]').textContent='';}
}
function render(){
 evaluation=evaluateMission(state.manifest);const r=evaluation,l=r.loading,unlocked=!!state.prediction,valid=isCurrentAttempt(state.attempt,state.manifest);
 $('[data-prediction]').hidden=unlocked;
 $('[data-prediction-note]').textContent=unlocked?`Your starting prediction: ${{mass:'too much mass',balance:'the balance',runway:'the runway',try:'try it and see'}[state.prediction]}. Now test it.`:'';
 for(const id of Object.keys(LOADS)){$(`[data-station="${id}"]`).value=state.manifest[id].station;$(`[data-station="${id}"]`).disabled=!unlocked;}
 $('[data-cargo]').value=state.manifest.baggage.mass;$('[data-cargo]').disabled=!unlocked;$('[data-cargo-value]').textContent=`${state.manifest.baggage.mass} kg`;
 $('[data-mass]').textContent=`${l.mass.toFixed(0)} kg`;$('[data-cg]').textContent=`${l.cg.toFixed(3)} m`;$('[data-payload]').textContent=`${l.payload.toFixed(0)} kg`;
 $('[data-cg-marker]').style.left=`${Math.max(0,Math.min(100,(l.cg-1.8)/1.6*100))}%`;
 $('[data-load-markers]').innerHTML=l.rows.map((row,i)=>`<span class="manifest-load ${row.arm>4?'is-aft':row.arm<2?'is-front':''}" style="left:${row.arm/6*100}%;top:${i*38}px">${names[row.id]} · ${row.mass} kg · ${row.arm.toFixed(1)} m</span>`).join('');
 $('[data-loading-status]').textContent=l.passed?'Loading checks passed.':l.faults.map(f=>faultText[f]).join(' ');
 $('[data-handoff]').textContent=`This runway attempt uses ${l.mass.toFixed(0)} kg from your manifest: 700 kg empty aircraft + 80 kg pilot + 80 kg passenger + ${state.manifest.baggage.mass} kg cargo + 80 kg fuel. No separate mass setting.`;
 $('[data-run]').disabled=!unlocked||!l.passed;
 $$('[data-save]').forEach(b=>b.disabled=!valid);
 $('[data-step="load"]').classList.toggle('is-done',unlocked);$('[data-step="balance"]').classList.toggle('is-done',l.passed&&unlocked);$('[data-step="run"]').classList.toggle('is-done',valid&&r.passed);
 for(const k of ['A','B'])$(`[data-restore="${k}"]`).disabled=!state.trials[k];
 $('[data-trials]').innerHTML=['A','B'].map(k=>{const a=state.trials[k];if(!a)return `<tr><th>${k}</th><td colspan="4">Not saved</td></tr>`;const v=evaluateMission(a.manifest);return `<tr><th>${k}</th><td>${v.loading.rows.map(row=>`${names[row.id]} ${row.mass} kg at ${row.arm.toFixed(1)} m`).join('<br>')}</td><td>${v.loading.mass} kg<br>${v.loading.cg.toFixed(3)} m</td><td>${v.runway.required.toFixed(0)} m / 450 m</td><td>${describeResult(v)}</td></tr>`;}).join('');
 if(state.trials.A&&state.trials.B){const a=evaluateMission(state.trials.A.manifest),b=evaluateMission(state.trials.B.manifest);$('[data-comparison]').textContent=`B − A: mass ${(b.loading.mass-a.loading.mass).toFixed(0)} kg; CG ${(100*(b.loading.cg-a.loading.cg)).toFixed(1)} cm; required ground run ${(b.runway.required-a.runway.required).toFixed(0)} m. Both use the same airport conditions.`;}else $('[data-comparison]').textContent='Save before and after to compare mass, balance and ground run together.';
 outcome();transport();
}
function edit(change){stop();change();state.attempt=null;render();paint(0);$('[data-outcome]').textContent='Manifest changed. The previous runway result no longer applies. '+(evaluation.loading.passed?'Run this version to test it.':'Fix the loading checks first.');persist();}
$('[data-load-controls]').innerHTML=`<label for="cargo-mass">Cargo mass <output data-cargo-value for="cargo-mass" aria-live="off"></output><input id="cargo-mass" data-cargo type="range" min="0" max="200" step="10" /></label>`+Object.entries(LOADS).map(([id,def])=>`<label for="station-${id}">${names[id]} station<select id="station-${id}" data-station="${id}">${def.names.map((n,i)=>`<option value="${i}">${n} · ${def.stations[i].toFixed(2)} m</option>`).join('')}</select></label>`).join('');
$$('[data-station]').forEach(el=>el.addEventListener('change',()=>edit(()=>state.manifest[el.dataset.station].station=Number(el.value))));
$('[data-cargo]').addEventListener('input',event=>edit(()=>state.manifest.baggage.mass=Number(event.target.value)));
$$('[data-guess]').forEach(b=>b.addEventListener('click',()=>{state.prediction=b.dataset.guess;render();persist();$('[data-cargo]').focus();}));
$('[data-run]').addEventListener('click',()=>{
 stop();state.attempt=null;render();persist();
 player=new Playback({duration:evaluation.runway.duration,paint,changed:transport,done:()=>{state.attempt=saveAttempt(state.manifest);render();persist();}});
 $('[data-outcome]').textContent='Testing this manifest. Watch the remaining runway.';
 if(skipMotion())player.finish();else player.start();
});
$('[data-pause]').addEventListener('click',()=>{if(player.status==='playing')player.pause();else player.start();});
$('[data-finish]').addEventListener('click',()=>player?.finish());
$('[data-seek]').addEventListener('input',e=>player?.seek(Number(e.target.value)/1000*player.duration));
$$('[data-save]').forEach(b=>b.addEventListener('click',()=>{state.trials[b.dataset.save]=saveAttempt(state.manifest);render();persist();}));
$$('[data-restore]').forEach(b=>b.addEventListener('click',()=>{stop();const saved=state.trials[b.dataset.restore];state.manifest=structuredClone(saved.manifest);state.attempt=structuredClone(saved);state.prediction=state.prediction||'try';render();paint(evaluation.runway.duration);persist();}));
$('[data-clear]').addEventListener('click',()=>{state.trials={};render();persist();});
$('[data-reset]').addEventListener('click',()=>{stop();const trials=state.trials;state=emptyProgress();state.trials=trials;render();paint(0);persist();$('[data-guess]').focus();});
$('[data-no-motion]').addEventListener('change',()=>{if(skipMotion()&&player)player.finish();transport();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&player?.status==='playing')player.pause();});
reduced.addEventListener('change',()=>{if(reduced.matches&&player)player.finish();transport();});
render();paint(isCurrentAttempt(state.attempt,state.manifest)?evaluation.runway.duration:0);persist();
