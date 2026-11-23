import {avatarUrl} from './profile-picture.js';
import {button,node,rate} from './workspace-ui.js';
import {portfolioPath} from './portfolio-preferences.js';

export function openPortfolioShare(profile, stats, name) {
  const panel=node('dialog','','n-out portfolio-share-sheet');
  panel.setAttribute('aria-label','Share card');
  const close=button('Close',()=>panel.close());
  const head=node('header');
  head.append(node('h2','Share card'),close);
  panel.append(head);
  panel.addEventListener('close',()=>panel.remove(),{once:true});
  document.body.append(panel);
  panel.showModal();

  if(!profile?.slug || !['link','public'].includes(profile.visibility)){
    panel.append(node('p','Set your saved portfolio to Anyone with the link or Public to share it.'));
    const settings=node('a','Portfolio settings','btn btn-primary');
    settings.href='/settings#portfolio';
    panel.append(settings);
    return;
  }

  const href=new URL(portfolioPath(profile.slug),location.origin).href;
  const status=node('p');
  status.setAttribute('role','status');
  const canvas=node('canvas','','portfolio-share-image');
  canvas.hidden=true;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','Ledgerline portfolio card with a QR code');
  const open=node('a','Open shared profile','btn btn-secondary');
  open.href=href+'?view=visitor';
  const copy=button('Copy link',async()=>{
    try{await navigator.clipboard.writeText(href);status.textContent='Portfolio link copied.';}
    catch{status.textContent=href;}
  });
  const save=button('Save image',()=>{
    const download=document.createElement('a');
    download.href=canvas.toDataURL('image/png');
    download.download='ledgerline-portfolio.png';
    download.click();
  });
  const share=button('Share',async()=>{
    if(!navigator.share){copy.click();return;}
    try{await navigator.share({title:'Ledgerline portfolio',url:href});}
    catch(error){if(error.name!=='AbortError')status.textContent='Could not share the link. You can still copy it.';}
  });
  save.disabled=true;
  panel.append(canvas,open,copy,share,save,status);
  void renderCard().catch(()=>{status.textContent='Could not draw the share card. The portfolio link is still available.';});

  async function renderCard(){
    const rendered = await buildPortfolioCard(profile,stats,name,'landscape',href);
    if(!panel.isConnected)return;
    canvas.width=rendered.width;
    canvas.height=rendered.height;
    canvas.getContext('2d').drawImage(rendered,0,0);
    canvas.hidden=false;
    save.disabled=false;
  }
}

export const portfolioCardFormats = {
  story:{label:'Story',width:1080,height:1920},
  post:{label:'Post',width:1080,height:1080},
  landscape:{label:'Landscape',width:1080,height:720},
};

export const portfolioStatKeys=['adherence','streak','reviews'];

export function portfolioCardMetrics(selected,stats){
  const metrics=[];
  if(selected?.adherence&&Number.isFinite(stats.adherence))metrics.push([rate(stats.adherence),'Rules kept']);
  if(selected?.streak&&Number.isFinite(stats.streak))metrics.push([String(stats.streak),'Streak days']);
  if(selected?.reviews&&Number.isFinite(stats.reviews))metrics.push([String(stats.reviews),'Reviewed']);
  return metrics;
}

const cardLayouts = {
  story: {x:128,y:333,w:824,h:1140,banner:218,portrait:174,name:55,chart:160,footer:1728,qr:150},
  post: {x:110,y:161,w:860,h:745,banner:148,portrait:124,name:49,chart:103,footer:935,qr:110},
  landscape: {x:58,y:124,w:964,h:424,banner:124,portrait:106,name:42,chart:94,footer:577,qr:112},
};

function cardBox(ctx,x,y,w,h,r,fill) {
  ctx.fillStyle=fill;
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,r);
  ctx.fill();
}

function cardText(ctx,text,x,y,{fill='#1d2030',size=32,weight=600,align='left',max=920}={}) {
  ctx.fillStyle=fill;
  ctx.textAlign=align;
  ctx.font=weight+' '+size+'px "Schibsted Grotesk Variable", Arial, sans-serif';
  ctx.fillText(text,x,y,max);
}

async function cardImage(src) {
  const image=new Image();
  image.src=src;
  try { await image.decode();return image; }
  catch { return null; }
}

function drawMotif(ctx,cx,cy,radius,color,value) {
  const sixPoints=(scale)=>Array.from({length:6},(_,i)=>{
    const angle=i*Math.PI/3-Math.PI/2;
    return [cx+Math.cos(angle)*radius*scale,cy+Math.sin(angle)*radius*scale];
  });
  for (const fraction of [.25,.5,.75,1]) {
    ctx.beginPath();
    for (const [i,[x,y]] of sixPoints(fraction).entries()) {
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle='#d9d6e3';
    ctx.lineWidth=2;
    ctx.stroke();
  }
  ctx.beginPath();
  for(const [x,y] of sixPoints(1)){ctx.moveTo(cx,cy);ctx.lineTo(x,y);}
  ctx.stroke();
  if(value!=null)cardBox(ctx,cx-radius*.43,cy-23,radius*.86,46,16,'#faf7ee');
  if(value!=null){
    cardText(ctx,rate(value),cx,cy+10,{fill:color,size:radius*.33,weight:750,align:'center',max:radius*1.1});
  }
}

export async function buildPortfolioCard(profile,stats,name,format,href) {
  const dimensions=portfolioCardFormats[format];
  const layout=cardLayouts[format];
  const wide=format==='landscape';
  const canvas=node('canvas');
  canvas.width=dimensions.width;
  canvas.height=dimensions.height;
  const ctx=canvas.getContext('2d');
  const selected=profile.sections??{};
  const display=profile.displayName || name || 'Ledgerline trader';
  const [logo,portrait,qr]=await Promise.all([
    cardImage('/ledgerline-icon.svg'),
    selected.photo&&stats.avatar?cardImage(avatarUrl(stats.avatar)):null,
    href?import('./streak-invite-qr.js').then(async ({drawInviteQr})=>{
      const qrCanvas=node('canvas');
      await drawInviteQr(qrCanvas,href);
      return qrCanvas;
    }):null,
    document.fonts?.load('700 42px "Schibsted Grotesk Variable"'),
  ]);
  const [light,deep,accent]=({
    terracotta:['#cf8b77','#8c4936','#a44c33'],
    dashboard:['#919cf1','#333c9a','#4f5bd5'],
  })[profile.design]??['#878bee','#373ba4','#4f5bd5'];
  const {x,y,w,h,banner}=layout;
  const cx=wide?304:x+w/2;
  const chartX=wide?770:cx;
  const gradient=ctx.createLinearGradient(0,0,canvas.width*.7,canvas.height);
  gradient.addColorStop(0,light);
  gradient.addColorStop(1,deep);
  cardBox(ctx,0,0,canvas.width,canvas.height,74,gradient);
  const shine=ctx.createRadialGradient(470,0,0,470,0,780);
  shine.addColorStop(0,'#ffffff39');
  shine.addColorStop(1,'#ffffff00');
  cardBox(ctx,0,0,canvas.width,canvas.height,74,shine);
  if(logo)ctx.drawImage(logo,56,53,52,52);
  cardText(ctx,'Ledgerline',123,91,{fill:'#fff',size:42,weight:750});
  cardText(ctx,'Trader portfolio',1021,87,{fill:'#fff',size:28,align:'right'});

  ctx.shadowColor='#17173380';
  ctx.shadowBlur=38;
  ctx.shadowOffsetY=25;
  cardBox(ctx,x,y,w,h,65,'#faf7ee');
  ctx.shadowColor='transparent';
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,65);
  ctx.clip();
  const orange=ctx.createLinearGradient(x,y,x+w,y+banner);
  orange.addColorStop(0,'#ffb450');
  orange.addColorStop(1,'#f07a2a');
  ctx.fillStyle=orange;
  ctx.fillRect(x,y,w,banner);
  if(selected.adherence&&stats.adherence!=null){
    const statSize=wide?45:format==='story'?107:63;
    cardText(ctx,rate(stats.adherence),x+42,y+statSize+15,{fill:'#fff',size:statSize,weight:800,max:240});
    cardText(ctx,'RULES KEPT',x+45,y+statSize+45,{fill:'#fff',size:wide?15:24,weight:800});
  }
  if(selected.streak&&stats.streak!=null){
    cardBox(ctx,x+w-202,y+29,168,55,28,'#fff8ef');
    cardText(ctx,stats.streak+' day streak',x+w-118,y+66,{fill:'#8d3c10',size:23,weight:750,align:'center',max:142});
  }
  ctx.restore();

  const portraitY=y+banner-10;
  const photoRadius=layout.portrait/2;
  ctx.beginPath();
  ctx.arc(cx,portraitY,photoRadius,0,Math.PI*2);
  ctx.fillStyle='#fffaf0';
  ctx.fill();
  ctx.strokeStyle='#f07a2a';
  ctx.lineWidth=12;
  ctx.stroke();
  if(portrait){
    ctx.save();
    ctx.clip();
    ctx.drawImage(portrait,cx-photoRadius,portraitY-photoRadius,layout.portrait,layout.portrait);
    ctx.restore();
  }else{
    cardText(ctx,Array.from(display.trim())[0]?.toUpperCase()??'L',cx,portraitY+layout.portrait*.21,
      {fill:accent,size:layout.portrait*.56,weight:750,align:'center'});
  }
  const nameY=portraitY+photoRadius+layout.name+14;
  cardText(ctx,display,cx,nameY,{size:layout.name,weight:750,align:'center',max:wide?420:w-70});
  if(profile.headline)cardText(ctx,profile.headline,cx,nameY+44,{fill:'#625b55',size:27,align:'center',max:wide?400:w-70});
  const motifY=wide?y+banner+107:nameY+(format==='story'?270:151);
  drawMotif(ctx,chartX,motifY,layout.chart,accent,selected.adherence?stats.adherence:null);

  const metrics=portfolioCardMetrics(selected,stats);
  if(!metrics.length)cardText(ctx,'No stats selected',chartX,motifY+layout.chart+35,{fill:'#625b55',size:26,align:'center',max:330});
  const tileBand=wide?455:w-100;
  const tileLeft=wide?x+w-tileBand-34:x+50;
  const tileWidth=Math.min(224,(tileBand-(metrics.length-1)*10)/Math.max(1,metrics.length));
  const tileStart=tileLeft+(tileBand-(tileWidth+10)*metrics.length+10)/2;
  const tileY=y+h-(wide?97:126);
  metrics.forEach(([value,label],i)=>{
    const start=tileStart+i*(tileWidth+10);
    cardBox(ctx,start,tileY,tileWidth,wide?70:89,18,'#fffdf9');
    cardText(ctx,value,start+tileWidth/2,tileY+(wide?30:41),{size:wide?27:35,weight:750,align:'center'});
    cardText(ctx,label,start+tileWidth/2,tileY+(wide?54:72),{size:wide?17:22,align:'center',fill:'#6f6556',max:tileWidth-10});
  });

  if(qr){
    const qrX=canvas.width-layout.qr-57;
    const linkWidth=qrX-77;
    cardBox(ctx,57,layout.footer+(layout.qr-76)/2,linkWidth,76,26,'#fff');
    cardText(ctx,(new URL(href).host+new URL(href).pathname),57+linkWidth/2,layout.footer+(layout.qr-76)/2+47,
      {fill:deep,size:27,weight:750,align:'center',max:linkWidth-38});
    const padding=9;
    cardBox(ctx,qrX-padding,layout.footer-padding,layout.qr+padding*2,layout.qr+padding*2,20,'#222135');
    ctx.drawImage(qr,qrX,layout.footer,layout.qr,layout.qr);
  }
  return canvas;
}
