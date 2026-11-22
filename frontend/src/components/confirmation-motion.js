import './confirmation-motion.css';
import './card-surface.css';

export function confirmationCard(kind,caption){
  const mentor=kind==='mentor';
  const card=document.createElement('div');
  card.className='ll-confirm '+(mentor?'ll-credential':'ll-receipt');
  card.setAttribute('role','status');
  card.innerHTML=`<div class="ll-emblem" aria-hidden="true">
    <svg viewBox="0 0 112 112" fill="none">
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


export function showConfirmation(kind, caption, done = () => {}) {
  const mentor = kind === 'mentor';
  const title = mentor ? 'Mentor verified' : 'Payment confirmed';
  const dialog = document.createElement('dialog');
  dialog.className = 'll-confirm-dialog ' + (mentor ? 'll-verify-scene' : 'll-paid-scene');
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `
    <div class="ll-success-field" aria-hidden="true"></div>
    <div class="ll-success-stage" aria-hidden="true">
      <div class="ll-orbit"><i></i><i></i><i></i></div>
      <div class="ll-insignia"><i></i><i></i><i></i></div>
      <div class="ll-medallion">
        <svg viewBox="0 0 40 40" fill="none"><path d="m9 20 7 7 15-15" pathLength="1"/></svg>
      </div>
    </div>
    <div class="ll-success-copy"><h2>${title}</h2><p></p></div>
    <button type="button" class="ll-success-continue" autofocus>Continue <span aria-hidden="true">→</span></button>`;
  dialog.querySelector('p').textContent = caption;
  dialog.querySelector('button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    dialog.remove();
    done();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
