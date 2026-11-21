import './confirmation-motion.css';
import './card-surface.css';

export function confirmationCard(kind,caption,animate=true){
  const mentor=kind==='mentor';
  const card=document.createElement('div');
  card.className='ll-confirm '+(mentor?'ll-credential':'ll-receipt');
  if(animate)card.classList.add('ll-reveal');
  card.setAttribute('role','status');
  card.innerHTML=`<div class="ll-emblem" aria-hidden="true">
    <svg viewBox="0 0 112 112" fill="none">
      <g class="ll-cube" stroke="currentColor" stroke-width="2"><path d="m56 20 29 16v35L56 89 27 71V36z M27 36l29 17 29-17 M56 53v36"/></g>
      <g class="ll-document"><rect x="16" y="25" width="80" height="62" rx="10"/><circle cx="39" cy="47" r="7"/><path d="M27 66q12-18 24 0 M60 44h24 M60 55h18 M60 66h13"/></g>
      <path class="ll-scanner" d="M13 30h86"/>
      <g class="ll-seal"><circle cx="56" cy="56" r="35"/><circle class="ll-rim" cx="56" cy="56" r="29"/><path class="ll-tick" pathLength="1" d="m41 56 10 10 21-23"/></g>
    </svg></div><div class="ll-confirm-copy"><small>Ledgerline</small><strong></strong><span></span></div>`;
  card.querySelector('strong').textContent=mentor?'Mentor verified':'Payment confirmed';
  card.querySelector('.ll-confirm-copy span').textContent=caption;
  return card;
}

export function checkoutCard(){
  const card=document.createElement('div');
  card.className='ll-pay-card ll-card-surface';
  card.setAttribute('aria-hidden','true');
  card.innerHTML='<span>Ledgerline</span><i class="br-chip"></i><strong></strong>';
  return card;
}

