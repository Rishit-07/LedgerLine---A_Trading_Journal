import {node} from './workspace-ui.js';

export const avatarUrl = base64 => base64 ? 'data:image/jpeg;base64,'+base64.replace(/\s/g,'') : '';

export function communityAvatar(name, photo) {
  const initials=String(name??'').trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase();
  const avatar=node('span',initials||'L','community-initial n-in');
  avatar.setAttribute('aria-hidden','true');
  if(photo){
    const image=node('img');
    image.alt='';
    image.loading='lazy';
    image.src=avatarUrl(photo);
    image.onerror=()=>image.remove();
    avatar.append(image);
  }
  return avatar;
}
