import sharp from 'sharp';
import {readJson,send} from './http.js';

export function createProfilePictureHandler(pool,authenticate) {
  return async (req,res)=>{
    const user=await authenticate(req,res);
    if(!user)return;
    const {data,error}=await readJson(req,1_410_000);
    const input=data?.image;
    const invalid=()=>send(res,error??400,{error:'Choose a valid JPG, PNG or WebP profile picture.'});
    if(error || input===undefined || (input!==null&&typeof input!=='string'))return invalid();
    let image=null;
    if(input!==null){
      const bytes=Buffer.from(input,'base64');
      if(!bytes.length||bytes.length>1024*1024||bytes.toString('base64')!==input)return invalid();
      try{
        const source=sharp(bytes,{limitInputPixels:2400*2400,failOn:'warning'});
        if(!['jpeg','png','webp'].includes((await source.metadata()).format))return invalid();
        image=await source.rotate().resize(128,128,{fit:'cover'}).flatten({background:'#f3f2ec'}).jpeg({quality:83}).toBuffer();
        if(image.length>24576)return invalid();
      }catch{return invalid();}
    }
    try{
      const result=await pool.query('UPDATE user_profile SET profile_picture=$2 WHERE user_id=$1 AND onboarded_at IS NOT NULL',[user.uid,image]);
      if(!result.rowCount)return send(res,404,{error:'Profile unavailable.'});
      return send(res,200,{avatar:image?.toString('base64')??null});
    }catch{return send(res,503,{error:'Could not save your profile picture.'});}
  };
}
