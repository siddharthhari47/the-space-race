const gate=document.querySelector('[data-lab-gate]');
const status=document.querySelector('[data-lab-startup]');
const pages={loading:()=>import('./loading.js'),runway:()=>import('./runway.js'),'cargo-mission':()=>import('./cargo-mission.js'),'departure-window':()=>import('./departure-window.js')};
try {
  await pages[gate.dataset.labGate]();
  gate.disabled=false;
  status.hidden=true;
} catch {
  status.textContent='The experiment could not start. Reload the page to try again. ';
  const retry=document.createElement('button');
  retry.type='button';retry.className='ctrl';retry.textContent='Reload experiment';
  retry.addEventListener('click',()=>location.reload());status.append(retry);
}
