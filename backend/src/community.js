const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function requireField(ok, message, status = 400) {
  if (!ok) throw Object.assign(new Error(message), { status });
}
const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

export function communityApi(query) {
  async function people(uid) {
    const profiles = await query(`SELECT w.slug::text, coalesce(nullif(w.display_name,''),p.display_name) AS name,
      (SELECT f.status FROM streak_friends f WHERE f.status<>'ended' AND ((f.user_id=$1 AND f.friend_user_id=p.user_id) OR (f.friend_user_id=$1 AND f.user_id=p.user_id)) LIMIT 1) AS connection,
      w.headline, p.streak_invite_code::text AS code,
      CASE WHEN (w.sections->>'streak')='true' THEN coalesce(s.current,0) END AS streak
      FROM portfolios w JOIN user_profile p USING(user_id) LEFT JOIN streak_state s USING(user_id)
      WHERE w.visibility='public' AND w.user_id<>$1 AND p.onboarded_at IS NOT NULL ORDER BY lower(coalesce(nullif(w.display_name,''),p.display_name)),w.slug`,[uid]);
    return { profiles };
  }
  return {people};
}

export function groupStore(query,kind){
  if(!['club','space'].includes(kind))throw Error('Invalid group type');
  const table=kind+'s',fk=kind+'_id';
  const entitled = owner => `EXISTS(SELECT 1 FROM mentor_entitlements e JOIN mentor_verifications v USING(user_id)
    WHERE e.user_id=${owner} AND v.status='approved' AND e.active AND (e.expires_at IS NULL OR e.expires_at>now()))`;
  async function mentorState(uid){
    const [state]=await query(`SELECT (SELECT status FROM mentor_verifications WHERE user_id=$1) AS verification,
      ${entitled('$1')} AS entitled, EXISTS(SELECT 1 FROM mentor_plan_requests WHERE user_id=$1) AS requested`,[uid]);
    return state;
  }
  function deny(reason){
    throw Object.assign(new Error(reason==='not_verified'?'Verify your mentor account first.':'Unlock the Mentor plan first.'),{status:403,reason});
  }
  async function groups(uid,selectedId=null) {
    const clubs = await query(`SELECT c.id::text,c.name,c.location,c.description,c.owner_id=$1 AS owner,
      c.join_mode AS "joinMode",c.visibility, ${kind==='space'?'NOT '+entitled('c.owner_id'):'false'} AS "readOnly", CASE WHEN c.owner_id=$1 THEN c.invite_code END AS code,
      EXISTS(SELECT 1 FROM ${kind}_requests r WHERE r.${fk}=c.id AND r.user_id=$1) AS pending,
      m.stats_opt_in AS "statsOptIn",m.user_id IS NOT NULL AS joined,(SELECT count(*)::int FROM ${kind}_members WHERE ${fk}=c.id) AS members
      FROM ${table} c LEFT JOIN ${kind}_members m ON m.${fk}=c.id AND m.user_id=$1
      WHERE m.user_id IS NOT NULL OR ($2='club' AND (c.visibility='public' OR c.id=$3 OR EXISTS
        (SELECT 1 FROM club_requests pending WHERE pending.club_id=c.id AND pending.user_id=$1)))
      ORDER BY (c.id=$3) DESC NULLS LAST,(m.user_id IS NOT NULL) DESC,c.created_at DESC,c.id`,[uid,kind,uuid.test(selectedId??'')?selectedId:null]);
    const topics = await query(`SELECT t.id::text,t.${fk}::text AS "groupId",t.kind,t.body,t.created_at AS "createdAt",p.display_name AS author,
      EXISTS(SELECT 1 FROM ${kind}_checkins WHERE topic_id=t.id AND user_id=$1) AS checked,
      (SELECT count(*)::int FROM ${kind}_checkins k JOIN ${kind}_members cm ON cm.${fk}=c.id AND cm.user_id=k.user_id WHERE k.topic_id=t.id) AS completions,
      coalesce((SELECT json_agg(json_build_object('author',rp.display_name,'body',r.body) ORDER BY r.id)
        FROM ${kind}_replies r JOIN user_profile rp ON rp.user_id=r.user_id WHERE r.topic_id=t.id),'[]') AS replies
      FROM ${kind}_posts t JOIN ${table} c ON c.id=t.${fk} JOIN ${kind}_members m ON m.${fk}=c.id AND m.user_id=$1
      JOIN user_profile p ON p.user_id=t.author_id ORDER BY t.id DESC`,[uid]);
    const members=await query(`SELECT cm.${fk}::text AS "groupId",p.display_name AS name,cm.joined_at AS "joinedAt",
      CASE WHEN ${kind==='space'?'cm.stats_opt_in AND c.owner_id=$1':'false'} THEN
        (SELECT round(100.0*count(*) FILTER(WHERE kept)/nullif(count(*),0)) FROM trade_checks WHERE user_id=cm.user_id) END AS adherence,
      c.owner_id=cm.user_id AS host FROM ${kind}_members cm JOIN ${table} c ON c.id=cm.${fk}
      JOIN user_profile p ON p.user_id=cm.user_id WHERE EXISTS
      (SELECT 1 FROM ${kind}_members self WHERE self.${fk}=c.id AND self.user_id=$1)
      ORDER BY (c.owner_id=cm.user_id) DESC,cm.joined_at`,[uid]);
    const requests=await query(`SELECT r.user_id AS member,r.${fk}::text AS "groupId",p.display_name AS name FROM ${kind}_requests r
      JOIN ${table} g ON g.id=r.${fk} JOIN user_profile p ON p.user_id=r.user_id WHERE g.owner_id=$1`,[uid]);
    return {groups:clubs,topics,members,requests,...(kind==='space'?{mentor:await mentorState(uid)}:{})};
  }
  async function change(uid, input) {
    const {action,body,topicId} = input;
    let id=input.id;
    const label = kind==='space'?'space':'club';
    if(kind==='space' && ['verify','unlock'].includes(action)){
      if(action==='verify')await query("INSERT INTO mentor_verifications(user_id,status) VALUES($1,'pending') ON CONFLICT(user_id) DO UPDATE SET status='pending' WHERE mentor_verifications.status='rejected'",[uid]);
      else {
        if((await mentorState(uid)).verification!=='approved')deny('not_verified');
        await query('INSERT INTO mentor_plan_requests(user_id) VALUES($1) ON CONFLICT DO NOTHING',[uid]);
      }
      return groups(uid);
    }
    if (action==='create') {
      if(kind==='space'){
        const state=await mentorState(uid);
        if(state.verification!=='approved')deny('not_verified');
        if(!state.entitled)deny('needs_plan');
      }
      requireField(validText(input.name,60) && validText(input.description,400) && typeof input.location==='string' && input.location.length<=60,'Enter a name and description.');
      const joinMode=kind==='space'?'invite':input.joinMode??'open', visibility=kind==='space'?'private':input.visibility??'public';
      requireField(['open','invite','request'].includes(joinMode)&&['public','private'].includes(visibility),'Choose valid joining and visibility settings.');
      await query(`WITH created AS (INSERT INTO ${table}(owner_id,name,description,location,join_mode,visibility) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id)
        INSERT INTO ${kind}_members(user_id,${fk}) SELECT $1,id FROM created`,[uid,input.name.trim(),input.description.trim(),input.location.trim(),joinMode,visibility]);
    } else {
      if(action==='join' && input.code){
        requireField(uuid.test(input.code),'Enter a valid invite code.');
        id=(await query(`SELECT id FROM ${table} WHERE invite_code=$1`,[input.code]))[0]?.id;
      }
      requireField(uuid.test(id),'Choose a '+label+'.');
      const [group]=await query(`SELECT owner_id,join_mode,invite_code, ${kind==='space'?entitled('owner_id'):'true'} AS writable FROM ${table} WHERE id=$1 FOR UPDATE`,[id]);
      requireField(group,'Group unavailable.',403);
      if(!group.writable && !['leave','consent'].includes(action))deny('needs_plan');
      let rows;
      if(action==='consent' && kind==='space'){
        requireField(typeof input.enabled==='boolean','Choose a sharing preference.');
        rows=await query('UPDATE space_members SET stats_opt_in=$3 WHERE user_id=$1 AND space_id=$2 RETURNING space_id',[uid,id,input.enabled]);
      }else if(['approve','decline'].includes(action)){
        requireField(group.owner_id===uid,'Only the host can manage requests.',403);
        rows=await query(`DELETE FROM ${kind}_requests WHERE ${fk}=$1 AND user_id=$2 RETURNING user_id`,[id,input.member]);
        if(rows.length && action==='approve')await query(`INSERT INTO ${kind}_members(user_id,${fk}) VALUES($1,$2) ON CONFLICT DO NOTHING`,[input.member,id]);
      }else if(action==='join' && group.join_mode==='request' && input.code!==group.invite_code){
        await query(`INSERT INTO ${kind}_requests(user_id,${fk}) VALUES($1,$2) ON CONFLICT DO NOTHING`,[uid,id]);
        return groups(uid);
      }else if(action==='join') {
        requireField(group.join_mode!=='invite'||input.code===group.invite_code,'An invite code is required.',403);
        await query(`DELETE FROM ${kind}_requests WHERE user_id=$1 AND ${fk}=$2`,[uid,id]);
        rows=await query(`INSERT INTO ${kind}_members(user_id,${fk}) SELECT $1,id FROM ${table} WHERE id=$2 AND $3='${kind}'
          ON CONFLICT(user_id,${fk}) DO UPDATE SET user_id=excluded.user_id RETURNING ${fk}`,[uid,id,kind]);
      } else if(action==='leave') {
        rows=await query(`DELETE FROM ${kind}_members m USING ${table} c WHERE m.user_id=$1 AND m.${fk}=c.id AND c.id=$2 AND $3='${kind}' AND c.owner_id<>$1 RETURNING c.id`,[uid,id,kind]);
      } else {
        requireField(['discussion','goal','reply','check','uncheck',...(kind==='space'?['announcement']:[])].includes(action),'Unknown community action.');
        const member=`FROM ${table} c JOIN ${kind}_members m ON m.${fk}=c.id AND m.user_id=$1 WHERE c.id=$2 AND $3='${kind}'`;
        if(['discussion','goal','announcement'].includes(action)) {
          requireField(validText(body,600),'Enter up to 600 characters.');
          rows=await query(`INSERT INTO ${kind}_posts(author_id,${fk},kind,body) SELECT $1,c.id,$4,$5 ${member}
            AND ($4='discussion' OR c.owner_id=$1) RETURNING id`,[uid,id,kind,action,body.trim()]);
          if(kind==='space' && rows.length && action!=='discussion')
            await query(`INSERT INTO ${action==='goal'?'space_assignments':'space_announcements'}(post_id) VALUES($1)`,[rows[0].id]);
        } else {
          requireField(/^[1-9]\d{0,17}$/.test(topicId),'Choose a discussion or goal.');
          const topic=`FROM ${kind}_posts t WHERE t.id=$4 AND t.${fk} IN (SELECT c.id ${member})`;
          if(action==='reply'){
            requireField(validText(body,600),'Enter a reply of up to 600 characters.');
            rows=await query(`INSERT INTO ${kind}_replies(user_id,topic_id,body) SELECT $1,t.id,$5 ${topic} AND t.kind='discussion' RETURNING id`,[uid,id,kind,topicId,body.trim()]);
          } else if(action==='check'){
            rows=await query(`INSERT INTO ${kind}_checkins(user_id,topic_id) SELECT $1,t.id ${topic} AND t.kind='goal'
              ON CONFLICT(topic_id,user_id) DO UPDATE SET user_id=excluded.user_id RETURNING topic_id`,[uid,id,kind,topicId]);
          } else {
            rows=await query(`DELETE FROM ${kind}_checkins WHERE user_id=$1 AND topic_id IN (SELECT t.id ${topic} AND t.kind='goal') RETURNING topic_id`,[uid,id,kind,topicId]);
          }
        }
      }
      requireField(rows.length,'This action is unavailable for this '+label+'.',403);
    }
    return groups(uid);
  }
  return {groups,change};
}
