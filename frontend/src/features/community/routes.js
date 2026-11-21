const idPattern='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const validId=new RegExp('^'+idPattern+'$','i');
const room=new RegExp('^/(clubs|spaces|community)/'+idPattern+'$','i');
export const roomPath=path=>room.test(path??'');

export function communityRedirect(url){
  const [section,sub,detail]=url.pathname.split('/').filter(Boolean);
  if(!['community','clubs','spaces','club','space','mentor-spaces'].includes(section))return null;
  const q=url.searchParams;
  const type=sub==='spaces'||sub==='space'||q.has('spaceId')||['space','spaces'].includes(q.get('kind')??q.get('type')??q.get('tab'))?'spaces':
    sub==='clubs'||sub==='club'||q.has('clubId')?'clubs':null;
  const id=[detail,sub,q.get('spaceId'),q.get('clubId'),q.get('groupId'),q.get('id')].find(value=>validId.test(value??''));
  const base=type??(['spaces','space','mentor-spaces'].includes(section)?'spaces':section==='community'&&id?'community':'clubs');
  const canonical='/'+base+(id?'/'+id:'');
  return canonical===url.pathname?null:canonical;
}
