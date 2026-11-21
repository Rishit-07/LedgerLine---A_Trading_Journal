import './file-actions.css';

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
  const card=document.createElement('div');
  card.className='upload-card';
  const title=document.createElement('strong');title.textContent=label;
  card.innerHTML='<div class="upload-card-head"><span class="upload-brand"><img src="/ledgerline-icon.svg" height="32" width="32" alt=""></span></div><div class="upload-drop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 16H6a4 4 0 0 1-.5-8A6.5 6.5 0 0 1 18 7a4.5 4.5 0 0 1 .5 9H17M12 20V9m-4 4 4-4 4 4"/></svg><strong>Choose a file or drag &amp; drop it here.</strong><small></small><button class="file-outline" type="button">Browse file</button></div><div class="upload-selected" hidden><span></span><button type="button" aria-label="Remove selected file">×</button></div><p class="upload-error" role="status"></p>';
  const outer=input.closest('label');
  outer.before(card);
  input.setAttribute('aria-label',label);
  card.append(input);outer.remove();
  input.classList.add('upload-native');input.tabIndex=-1;
  card.querySelector('.upload-card-head').append(title);
  const drop=card.querySelector('.upload-drop'),browse=drop.querySelector('button'),row=card.querySelector('.upload-selected'),error=card.querySelector('.upload-error');
  drop.querySelector('small').textContent='CSV · Up to '+maxBytes/1000+' KB';
  browse.onclick=()=>input.click();
  drop.onclick=event=>{if(!browse.contains(event.target))input.click();};
  function paint(){
    card.querySelector('progress')?.remove();
    const file=input.files[0];row.hidden=!file;
    row.firstElementChild.textContent=file?file.name+' · '+Math.max(1,Math.ceil(file.size/1000))+' KB':'';
    const issue=file && (!/\.csv$/i.test(file.name) || file.size>maxBytes) ? 'Choose a CSV up to '+maxBytes/1000+' KB.' : '';
    input.setCustomValidity(issue);error.textContent=issue;
  }
  let animating=false;
  input.addEventListener('change',async()=>{
    paint();
    if(!input.files.length || !input.validity.valid || animating || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    animating=true;
    try {const {revealLogo}=await import('./glass-logo.ts');await revealLogo(card.querySelector('.upload-brand'));}
    catch { /* The static brand mark stays visible when WebGL is unavailable. */ }
    finally {animating=false;}
  });
  input.oninvalid=event=>{event.preventDefault();error.textContent=input.validationMessage;browse.focus();};
  row.querySelector('button').onclick=()=>{input.value='';paint();browse.focus();};
  drop.ondragover=event=>{event.preventDefault();drop.classList.add('drag-over');};
  drop.ondragleave=event=>{if(!drop.contains(event.relatedTarget))drop.classList.remove('drag-over');};
  drop.ondrop=event=>{
    event.preventDefault();drop.classList.remove('drag-over');
    if(event.dataTransfer.files.length!==1){error.textContent='Choose one CSV at a time.';return;}
    input.files=event.dataTransfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  form.addEventListener('reset',()=>queueMicrotask(paint));
  paint();
  return (done,total)=>{
    let progress=card.querySelector('progress');
    if(!progress){progress=document.createElement('progress');progress.setAttribute('aria-label','Trades imported');card.append(progress);}
    progress.max=total;progress.value=done;
    if(done===total)progress.remove();
  };
}
