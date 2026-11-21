import sharp from 'sharp';
import { readJson, send } from './http.js';

const maxBytes = 1024 * 1024;
export const imageRequestLimit = 4 * Math.ceil(maxBytes / 3) + 8192;

export async function prepareScreenshot(base64) {
  const invalid = () => Object.assign(new Error('Choose a valid chart screenshot under 1 MB after resizing.'), {status:400});
  if (typeof base64 !== 'string' || !base64.length || base64.length > 4 * Math.ceil(maxBytes / 3)) throw invalid();
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > maxBytes || bytes.toString('base64') !== base64) throw invalid();
  try {
    const decoder = sharp(bytes, {limitInputPixels: 2400 * 2400, failOn: 'warning'});
    if ((await decoder.metadata()).format !== 'jpeg') throw invalid();
    const image = await decoder.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
    if (image.length > maxBytes) throw invalid();
    return image;
  } catch { throw invalid(); }
}

export async function tradeScreenshots(query, uid, id, request, response) {
  if (!/^[1-9]\d{0,17}$/.test(id ?? '')) return send(response,400,{error:'Choose a trade.'});
  const [trade] = await query('SELECT closed_at FROM trades WHERE user_id=$1 AND id=$2',[uid,id]);
  if (!trade) return send(response,404,{error:'Trade unavailable.'});
  if (request.method === 'GET') {
    const images = await query('SELECT stage,image FROM trade_screenshots WHERE user_id=$1 AND trade_id=$2',[uid,id]);
    return send(response,200,Object.fromEntries(images.map(({stage,image}) => [stage,image.toString('base64')])));
  }
  const {data,error} = await readJson(request,imageRequestLimit);
  if (error || !['before','after'].includes(data?.stage)) return send(response,error ?? 400,{error:'Choose a screenshot and try again.'});
  if (data.action === 'remove') {
    await query('DELETE FROM trade_screenshots WHERE user_id=$1 AND trade_id=$2 AND stage=$3',[uid,id,data.stage]);
    return send(response,200,{saved:true});
  }
  if (data.action !== 'save') return send(response,400,{error:'Unknown screenshot action.'});
  if (data.stage === 'after' && !trade.closed_at) return send(response,409,{error:'Close this trade before adding its exit screenshot.'});
  const image = await prepareScreenshot(data.image);
  const [saved] = await query(`INSERT INTO trade_screenshots (user_id,trade_id,stage,image)
    SELECT user_id,id,$3,$4 FROM trades WHERE user_id=$1 AND id=$2
    ON CONFLICT (user_id,trade_id,stage) DO UPDATE SET image=excluded.image RETURNING stage`,[uid,id,data.stage,image]);
  return saved ? send(response,200,{image:image.toString('base64')}) : send(response,404,{error:'Trade unavailable.'});
}
