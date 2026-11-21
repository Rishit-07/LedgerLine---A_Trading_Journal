import {groupStore} from './community.js';
import {readJson,send} from './http.js';

export function groupHandler(pool,authenticate,kind) {
  return async function handle(request,response) {
    const claims=await authenticate(request,response);
    if(!claims)return;
    let db;
    try {
      let input;
      if(request.method==='POST'){
        const {error,data}=await readJson(request,8192);
        if(error||!data||typeof data!=='object'||Array.isArray(data))return send(response,error??400,{error:'Check the form details.'});
        input={action:'create',...data};
      }
      db=await pool.connect();
      await db.query('BEGIN');
      const store=groupStore(async(sql,params)=>(await db.query(sql,params)).rows,kind);
      const data=input?await store.change(claims.uid,input):await store.groups(claims.uid);
      await db.query('COMMIT');
      send(response,200,data);
    } catch(error){
      if(db)await db.query('ROLLBACK').catch(()=>{});
      send(response,error.status??503,{error:error.status?error.message:'Community unavailable.',reason:error.reason});
    } finally {db?.release();}
  };
}
