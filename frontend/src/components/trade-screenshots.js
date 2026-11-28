import './trade-screenshots.css';
import { node, button } from '../pages/workspace-ui.js';
import { createFileUpload } from './file-upload.js';

const types = ['image/png','image/jpeg','image/webp'];
const caption = {before:'Before trade',after:'After trade'};

export function screenshotPicker(stage, labelText) {
  const uploader = createFileUpload({
    label: labelText || (caption[stage] + ' screenshot (optional)'),
    accept: types.join(','),
    maxSize: 12 * 1024 * 1024,
    maxFiles: 1,
  });
  return uploader.root;
}

export async function screenshotData(file) {
  if (!file) return undefined;
  if (!types.includes(file.type) || file.size > 12 * 1024 * 1024)
    throw new Error('Choose a PNG, JPG or WebP image up to 12 MB.');
  const source = new Image();
  const url = URL.createObjectURL(file);
  try {
    source.src = url;
    await source.decode().catch(() => {throw new Error('This image could not be opened. Choose another screenshot.');});
    const scale = Math.min(1,2400 / Math.max(source.naturalWidth,source.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1,Math.round(source.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    for (const quality of [.9,.77,.60,.43]) {
      const encoded = canvas.toDataURL('image/jpeg',quality).split(',')[1];
      if (encoded && encoded.length <= 4 * Math.floor(1024 * 1024 / 3)) return encoded;
    }
    throw new Error('Crop the image to the chart and try again.');
  } finally {URL.revokeObjectURL(url);}
}

function enlarge(image,title) {
  const dialog = node('dialog','','chart-image-dialog');
  dialog.setAttribute('aria-label',title);
  const header = node('header');
  header.append(node('strong',title),button('Close',() => dialog.close()));
  dialog.append(header,image.cloneNode());
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

export function tradeScreenshots(trade,request) {
  const section = node('section','','trade-screenshots');
  const grid = node('div','','chart-shot-grid');
  const status = node('p','Loading screenshots…');
  status.setAttribute('role','status');
  const endpoint = '/api/workspace?'+new URLSearchParams({page:'screenshots',tradeId:trade.id});
  section.append(node('h3','Chart screenshots'),grid,status);
  function slot(stage,saved) {
    const card = node('div','','chart-shot');
    const label = caption[stage];
    card.append(node('strong',label));
    if (saved) {
      const image = node('img');
      image.src = 'data:image/jpeg;base64,'+saved;
      image.alt = trade.symbol+' · '+label;
      const preview = button('',() => enlarge(image,image.alt));
      preview.className = 'chart-shot-preview';
      preview.setAttribute('aria-label','Enlarge '+label.toLowerCase()+' screenshot');
      preview.append(image);
      card.append(preview);
    }
    if (stage === 'after' && !trade.closedAt) {
      card.append(node('small','Add your exit chart when you close the trade.'));
      return card;
    }
    const picker = screenshotPicker(stage, saved ? 'Replace image' : 'Add screenshot');
    const input = picker.querySelector('input');
    const controls = node('div','','chart-shot-actions');
    picker.querySelector('input').setAttribute('aria-label',label+' screenshot');
    controls.append(picker);
    const feedback = node('small');
    feedback.setAttribute('role','status');
    async function change(action) {
      controls.inert = true;
      feedback.textContent = action === 'save' ? 'Saving image…' : 'Removing image…';
      try {
        const image = action === 'save' ? await screenshotData(input.files[0]) : undefined;
        const result = await request(endpoint,'POST',{stage,action,image});
        const replacement = slot(stage,result.image);
        card.replaceWith(replacement);
        replacement.querySelector('input')?.focus({preventScroll:true});
        status.textContent = label+' screenshot '+(action === 'save'?'saved.':'removed.');
      } catch (error) {feedback.textContent = error.message;input.value='';}
      finally {controls.inert=false;}
    }
    input.onchange = () => {if (input.files.length) void change('save');};
    if (saved) { const rm = button('Remove',() => {if(confirm('Remove this '+label.toLowerCase()+' screenshot?')) void change('remove');}); rm.className = 'btn btn-danger'; controls.append(rm); }
    card.append(controls,feedback);
    return card;
  }
  async function load() {
    status.textContent = 'Loading screenshots…';
    try {
      const images = await request(endpoint,'GET');
      grid.replaceChildren(slot('before',images.before),slot('after',images.after));
      status.textContent = '';
    } catch (error) {status.replaceChildren(document.createTextNode(error.message+' '),button('Retry',load));}
  }
  void load();
  return section;
}
