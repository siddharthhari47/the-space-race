import {MISSION, initialManifest, evaluateMission, isCurrentAttempt} from './cargo-mission.js';
export const STORAGE_KEY='space-race-cargo-mission-v1';
export function emptyProgress(){return {missionId:MISSION.id,manifest:initialManifest(),prediction:null,attempt:null,trials:{}};}
export function parseProgress(raw){
 const clean=emptyProgress();
 try{
  const saved=JSON.parse(raw);
  if(saved?.missionId!==MISSION.id)return clean;
  evaluateMission(saved.manifest);clean.manifest=structuredClone(saved.manifest);
  if(['mass','balance','runway','try'].includes(saved.prediction))clean.prediction=saved.prediction;
  if(isCurrentAttempt(saved.attempt,clean.manifest))clean.attempt=saved.attempt;
  for(const k of ['A','B'])if(isCurrentAttempt(saved.trials?.[k],saved.trials?.[k]?.manifest))clean.trials[k]=saved.trials[k];
 }catch{/* Invalid or incompatible progress becomes a fresh mission. */}
 return clean;
}
export function writeProgress(storage,progress){try{storage.setItem(STORAGE_KEY,JSON.stringify(progress));return true;}catch{return false;}}
