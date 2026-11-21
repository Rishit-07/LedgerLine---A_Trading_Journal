import {readJson,send,isEmail} from './http.js';
export function billingProfile(pool,authenticate){
 return async(req,res)=>{
  const u=await authenticate(req,res);if(!u)return;
  try{
   if(req.method==='GET'){const {rows:[row]}=await pool.query('SELECT billing_name,billing_email,gstin,address FROM billing_profiles WHERE user_id=$1',[u.uid]);return send(res,200,{...row,billing_email:u.email});}
   const {data,error}=await readJson(req,4096);
   if(error||!data||typeof data.billing_name!=='string'||!data.billing_name.trim()||data.billing_name.length>120||!isEmail(u.email)||typeof data.address!=='string'||data.address.length>600||typeof data.gstin!=='string'||(data.gstin&&!/^[0-9A-Z]{15}$/.test(data.gstin)))return send(res,error??400,{error:'Check your invoice details.'});
   await pool.query('INSERT INTO billing_profiles VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET billing_name=excluded.billing_name,billing_email=excluded.billing_email,gstin=excluded.gstin,address=excluded.address',[u.uid,data.billing_name.trim(),u.email,data.gstin,data.address.trim()]);send(res,200,{saved:true});
  }catch{send(res,503,{error:'Invoice profile unavailable.'});}
 };
}
