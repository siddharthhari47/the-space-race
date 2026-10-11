import {missionEntry} from '../systems/mission-entry.js';
import {STORAGE_KEY} from '../systems/mission-storage.js';
function refresh(){
 let raw=null;try{raw=localStorage.getItem(STORAGE_KEY);}catch{}
 const entry=missionEntry(raw);
 document.querySelectorAll('[data-mission-entry]').forEach(link=>{link.textContent=entry.label;link.href=entry.href;});
}
refresh();
window.addEventListener('pageshow',refresh);
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null)refresh();});
