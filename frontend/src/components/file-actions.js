import './file-actions.css';
import { createFileUpload } from './file-upload.js';

export function openingReveal() {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  try {
    if(sessionStorage.getItem('ledgerline-opening'))return;
    sessionStorage.setItem('ledgerline-opening','1');
  } catch { /* The intro still works with storage disabled. */ }
  const cover=document.createElement('div');
  cover.className='brand-opening';cover.setAttribute('aria-hidden','true');
  cover.innerHTML='<div class="brand-reveal-tile"><img src="/ledgerline-icon.svg" alt=""></div>';
  document.body.append(cover);
  const events=new AbortController();
  function dismiss(){
    if(events.signal.aborted)return;
    events.abort();cover.classList.add('is-leaving');setTimeout(()=>cover.remove(),220);
  }
  for(const type of ['pointerdown','keydown','pagehide'])window.addEventListener(type,dismiss,{once:true,signal:events.signal});
  const limit=setTimeout(dismiss,2300);
  import('./glass-logo.ts').then(async({revealLogo})=>{
    if(!events.signal.aborted)await revealLogo(cover.firstElementChild);
  }).catch(()=>{}).finally(()=>{clearTimeout(limit);setTimeout(dismiss,160);});
}

const downloadIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';
export function fileAction(button) {
  if(!button || button.classList.contains('file-action'))return;
  button.classList.add('file-action');
  if(!button.querySelector('svg'))button.insertAdjacentHTML('afterbegin',downloadIcon);
}
export function startedDownload(button) {
  if(!button)return;
  fileAction(button);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)
    button.querySelector('svg')?.animate([{transform:'translateY(-2px)'},{transform:'translateY(3px)'},{transform:'none'}],{duration:350});
}

export function fileCard(form,{label,maxBytes}) {
  const input=form.elements.file;
  const outer=input.closest('label');
  const uploader=createFileUpload({
    input,
    label,
    accept:'.csv,text/csv',
    maxSize:maxBytes,
    maxFiles:1,
  });
  outer.before(uploader.root);
  outer.remove();
  return (done,total)=>uploader.setProgress(done,total);
}
