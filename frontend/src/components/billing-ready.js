import './billing-ready.css';

export function billingReady(){
 const scene=document.createElement('div');
 scene.className='billing-ready';
 scene.setAttribute('aria-hidden','true');
 scene.innerHTML='<div class="br-shadow"></div><div class="br-card"><div class="br-face"><span>Ledgerline</span><i class="br-chip"></i><strong>Billing</strong><i class="br-mark"></i></div></div>';
 return scene;
}
