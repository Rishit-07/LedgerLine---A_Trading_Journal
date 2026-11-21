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
  async function groups(uid) {
    const clubs = await query(`SELECT c.id::text,c.name,c.location,c.description,c.owner_id=$1 AS owner,
      c.join_mode AS "joinMode",c.visibility, CASE WHEN c.owner_id=$1 THEN c.invite_code END AS code,
      EXISTS(SELECT 1 FROM ${kind}_requests r WHERE r.${fk}=c.id AND r.user_id=$1) AS pending,
      m.stats_opt_in AS "statsOptIn",m.user_id IS NOT NULL AS joined,(SELECT count(*)::int FROM ${kind}_members WHERE ${fk}=c.id) AS members
      FROM ${table} c LEFT JOIN ${kind}_members m ON m.${fk}=c.id AND m.user_id=$1
      WHERE (m.user_id IS NOT NULL OR (c.visibility='public' AND $2='club')) ORDER BY (m.user_id IS NOT NULL) DESC,c.created_at DESC,c.id`,[uid,kind]);
    const topics = await query(`SELECT t.id::text,t.${fk}::text AS "groupId",t.kind,t.body,t.created_at AS "createdAt",p.display_name AS author,
      EXISTS(SELECT 1 FROM ${kind}_checkins WHERE topic_id=t.id AND user_id=$1) AS checked,
      (SELECT count(*)::int FROM ${kind}_checkins k JOIN ${kind}_members cm ON cm.${fk}=c.id AND cm.user_id=k.user_id WHERE k.topic_id=t.id) AS completions,
      coalesce((SELECT json_agg(json_build_object('author',rp.display_name,'body',r.body) ORDER BY r.id)
        FROM ${kind}_replies r JOIN user_profile rp ON rp.user_id=r.user_id WHERE r.topic_id=t.id),'[]') AS replies
      FROM ${kind}_posts t JOIN ${table} c ON c.id=t.${fk} JOIN ${kind}_members m ON m.${fk}=c.id AND m.user_id=$1
      JOIN user_profile p ON p.user_id=t.author_id ORDER BY t.id DESC`,[uid]);
    const members=await query(`SELECT cm.${fk}::text AS "groupId",p.display_name AS name,cm.joined_at AS "joinedAt",
      c.owner_id=cm.user_id AS host FROM ${kind}_members cm JOIN ${table} c ON c.id=cm.${fk}
      JOIN user_profile p ON p.user_id=cm.user_id WHERE EXISTS
      (SELECT 1 FROM ${kind}_members self WHERE self.${fk}=c.id AND self.user_id=$1)
      ORDER BY (c.owner_id=cm.user_id) DESC,cm.joined_at`,[uid]);
    return {clubs,topics,members};
  }
  async function change(uid, input) {
    const {action,id,body,topicId} = input;
    const label = kind==='space'?'space':'club';
    if (action==='create') {
      requireField(validText(input.name,60) && validText(input.description,400) && typeof input.location==='string' && input.location.length<=60,'Enter a name and description.');
      const joinMode=kind==='space'?'invite':input.joinMode??'open', visibility=kind==='space'?'private':input.visibility??'public';
      requireField(['open','invite','request'].includes(joinMode)&&['public','private'].includes(visibility),'Choose valid joining and visibility settings.');
      await query(`WITH created AS (INSERT INTO ${table}(owner_id,name,description,location,join_mode,visibility) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id)
        INSERT INTO ${kind}_members(user_id,${fk}) SELECT $1,id FROM created`,[uid,input.name.trim(),input.description.trim(),input.location.trim(),joinMode,visibility]);
    } else {
      requireField(uuid.test(id),'Choose a '+label+'.');
      let rows;
      if(action==='join') {
        rows=await query(`INSERT INTO ${kind}_members(user_id,${fk}) SELECT $1,id FROM ${table} WHERE id=$2 AND $3='${kind}'
          ON CONFLICT(user_id,${fk}) DO UPDATE SET user_id=excluded.user_id RETURNING ${fk}`,[uid,id,kind]);
      } else if(action==='leave') {
        rows=await query(`DELETE FROM ${kind}_members m USING ${table} c WHERE m.user_id=$1 AND m.${fk}=c.id AND c.id=$2 AND $3='${kind}' AND c.owner_id<>$1 RETURNING c.id`,[uid,id,kind]);
      } else {
        requireField(['discussion','goal','reply','check','uncheck'].includes(action),'Unknown community action.');
        const member=`FROM ${table} c JOIN ${kind}_members m ON m.${fk}=c.id AND m.user_id=$1 WHERE c.id=$2 AND $3='${kind}'`;
        if(action==='discussion'||action==='goal') {
          requireField(validText(body,600),'Enter up to 600 characters.');
          rows=await query(`INSERT INTO ${kind}_posts(author_id,${fk},kind,body) SELECT $1,c.id,$4,$5 ${member}
            AND ($4<>'goal' OR c.owner_id=$1) RETURNING id`,[uid,id,kind,action,body.trim()]);
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
