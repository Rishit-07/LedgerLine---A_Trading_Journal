import '@fontsource-variable/geist';
import './card-surface.css';
import './billing-ready.css';

export function billingReady(){
 const scene=document.createElement('div');
 scene.className='billing-ready';
 scene.setAttribute('aria-hidden','true');
 scene.innerHTML='<div class="br-folds"></div><div class="br-card"><div class="br-face ll-card-surface"><span>Ledgerline</span><img class="br-ledger-mark" src="/ledgerline-icon.svg" alt=""><i class="br-chip"></i></div></div>';
 const folds = scene.querySelector('.br-folds');
 for (let layer = 0; layer < 11; layer++) {
   const sheet = document.createElement('i');
   sheet.style.setProperty('--angle', (12 - layer * 4.6) + 'deg');
   sheet.style.setProperty('--size', (100 - layer * 5.7) + '%');
   folds.append(sheet);
 }
 return scene;
}

export function playBillingIntro() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intro = document.createElement('dialog');
  intro.className = 'billing-intro';
  intro.setAttribute('aria-label', 'Opening Billing');
  const title = document.createElement('h2');
  title.textContent = 'Your billing workspace';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn btn-ghost';
  skip.textContent = 'Skip animation';
  skip.onclick = () => intro.close();
  const proceed = document.createElement('button');
  proceed.type = 'button';
  proceed.className = 'btn btn-primary br-continue';
  proceed.textContent = 'Continue →';
  proceed.hidden = true;
  proceed.onclick = () => intro.close();
  intro.append(billingReady(), title, skip, proceed);
  document.body.append(intro);
  intro.showModal();
  return new Promise(resolve => {
    const timer = setTimeout(() => { skip.hidden = true; proceed.hidden = false; proceed.focus({preventScroll:true}); }, reduced ? 0 : 2250);
    intro.addEventListener('close', () => {
      clearTimeout(timer);
      intro.remove();
      resolve();
    }, {once: true});
  });
}

export function processingCard(label = 'Confirming payment…') {
  const stage = document.createElement('div');
  stage.className = 'billing-processing';
  stage.setAttribute('role', 'status');
  const visual = document.createElement('div');
  visual.className = 'billing-process-visual';
  visual.setAttribute('aria-hidden','true');
  visual.innerHTML = '<span class="billing-process-base"></span><span class="billing-process-orbit"></span><span class="billing-process-card ll-card-surface"><span class="br-chip"></span></span>';
  stage.append(visual, document.createTextNode(label));
  return stage;
}

