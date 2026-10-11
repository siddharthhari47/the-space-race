import {parseProgress} from './mission-storage.js';
import {evaluateMission,isCurrentAttempt} from './cargo-mission.js';
export function missionEntry(raw){
 const state=parseProgress(raw),root='/flight-lab/cargo-mission.html';
 if(state.prediction){
  if(isCurrentAttempt(state.attempt,state.manifest))return {label:'Review your cargo mission →',href:root+'#mission-runway'};
  return {label:'Resume your cargo mission →',href:root+(evaluateMission(state.manifest).loading.passed?'#mission-runway':'#mission')};
 }
 if(state.trials.A||state.trials.B)return {label:'Review your saved missions →',href:root+'#mission-comparison'};
 return {label:'Take the cargo mission →',href:root};
}
