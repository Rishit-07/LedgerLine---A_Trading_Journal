import QRCode from 'qrcode';

const badgeSize = 11;
const errorCorrectionLevel = 'Q';
const quietZone = 4;
const defaultInk = '#171724';

function badgePosition(modules) {
  const start = (modules.size - badgeSize) / 2;
  for (let row = start; row < start + badgeSize; row++) {
    for (let column = start; column < start + badgeSize; column++) {
      if (modules.isReserved(row, column)) return null;
    }
  }
  return start;
}

function qrArtwork(link, ink, withBadge) {
  let code = QRCode.create(link, { errorCorrectionLevel });
  let badge = withBadge ? badgePosition(code.modules) : null;
  while (withBadge && badge === null && code.version < 40) {
    code = QRCode.create(link, { version: code.version + 1, errorCorrectionLevel });
    badge = badgePosition(code.modules);
  }
  const { modules } = code;
  const { size } = modules;
  const eyes = [[0, 0], [0, size - 7], [size - 7, 0]];
  const squares = [];
  const add = (row,col,width,radius,fill=ink)=>squares.push({
    x:col+quietZone,y:row+quietZone,width,radius,fill,
  });
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const inEye = eyes.some(([y, x]) => row >= y && row < y + 7 && column >= x && column < x + 7);
      if (!inEye && modules.get(row, column)) add(row,column,1,modules.isReserved(row,column)?0:.35);
    }
  }
  for (const [row,column] of eyes) {
    add(row,column,7,.7);
    add(row+1,column+1,5,.45,'#fff');
    add(row+2,column+2,3,.3);
  }
  if(badge!==null)add(badge,badge,badgeSize,1.25,'#fff');
  return {width:size+quietZone*2,squares,badge:badge===null?null:badge+quietZone+1};
}

let cachedIcon;
function loadIcon(){
  cachedIcon??=fetch('/ledgerline-icon.svg').then(response=>{
    if(!response.ok)throw Error('QR logo unavailable');
    return response.text();
  }).then(async svg=>{
    const src='data:image/svg+xml,'+encodeURIComponent(svg);
    const image=new Image();
    image.src=src;
    await image.decode();
    return {image,src};
  }).catch(()=>null);
  return cachedIcon;
}

export async function drawInviteQr(canvas,link,{ink=defaultInk}={}) {
  const icon=await loadIcon();
  const artwork=qrArtwork(link,ink,Boolean(icon));
  const moduleSize=10;
  canvas.width=canvas.height=artwork.width*moduleSize;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  for (const {x,y,width,radius,fill} of artwork.squares) {
    ctx.fillStyle=fill;
    ctx.beginPath();
    ctx.roundRect(x*moduleSize,y*moduleSize,width*moduleSize,width*moduleSize,radius*moduleSize);
    ctx.fill();
  }
  if(artwork.badge!==null){
    const offset=artwork.badge*moduleSize;
    const side=(badgeSize-2)*moduleSize;
    ctx.drawImage(icon.image,offset,offset,side,side);
  }
}

export async function inviteQrSvg(link,{ink=defaultInk}={}) {
  const icon=await loadIcon();
  const {width,squares,badge}=qrArtwork(link,ink,Boolean(icon));
  const printed=squares.map(({x,y,width,radius,fill})=>
    `<rect x="${x}" y="${y}" width="${width}" height="${width}" rx="${radius}" fill="${fill}"/>`).join('');
  const inset=badge===null?'':`<image x="${badge}" y="${badge}" width="${badgeSize-2}" height="${badgeSize-2}" href="${icon.src}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${width}"><rect width="${width}" height="${width}" fill="white"/>${printed}${inset}</svg>`;
}
