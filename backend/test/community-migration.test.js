import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

test('split and rollback preserve memberships, post IDs, replies and check-ins for both types',{
  skip:!process.env.STREAK_TEST_DATABASE_URL
},async()=>{
  const db=new pg.Client({connectionString:process.env.STREAK_TEST_DATABASE_URL});
  const schema='test_'+randomUUID().replaceAll('-','');
  const sql=async path=>(await readFile(new URL('../../database/'+path,import.meta.url),'utf8'))
    .replaceAll('public.',schema+'.').replaceAll('SET SCHEMA public;', 'SET SCHEMA '+schema+';').replaceAll('community_before_split',schema+'_before')
    .replaceAll('community_after_split',schema+'_after').replaceAll('community_restored_backup',schema+'_backup');
  await db.connect();
  try{
    await db.query('BEGIN');
    await db.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema},public;
      CREATE TABLE ledgerline_accounts(firebase_uid text PRIMARY KEY);
      CREATE TABLE ledgerline_schema_migrations(name text PRIMARY KEY);
      INSERT INTO ledgerline_accounts VALUES ('owner');
      CREATE TABLE clubs(LIKE community_before_split.backup_clubs INCLUDING ALL);
      ALTER TABLE clubs ADD PRIMARY KEY(id);
      CREATE TABLE club_members(LIKE community_before_split.backup_club_members INCLUDING ALL);`);
    await db.query(await sql('migrations/010_community.sql'));
    for(const type of ['club','space']){
      const id=randomUUID();
      await db.query("INSERT INTO clubs VALUES ($1,'owner',$2,'description','',now(),$2)",[id,type]);
      await db.query("INSERT INTO club_members VALUES ('owner',$1,now())",[id]);
      const post=(await db.query("INSERT INTO community_topics(club_id,author_id,kind,body) VALUES ($1,'owner','goal',$2) RETURNING id",[id,type])).rows[0];
      await db.query("INSERT INTO community_replies(topic_id,user_id,body) VALUES($1,'owner','reply')",[post.id]);
      await db.query("INSERT INTO community_checkins VALUES ($1,'owner')",[post.id]);
    }
    await db.query(await sql('migrations/015_split_community.sql'));
    for(const type of ['club','space']){
      const {rows}=await db.query(`SELECT g.name,r.body FROM ${type}s g JOIN ${type}_members m ON m.${type}_id=g.id
        JOIN ${type}_posts p ON p.${type}_id=g.id JOIN ${type}_replies r ON r.topic_id=p.id JOIN ${type}_checkins k ON k.topic_id=p.id`);
      assert.deepEqual(rows,[{name:type,body:'reply'}]);
    }
    await db.query((await sql('rollback/015_split_community.sql')).replace('BEGIN;','').replace('COMMIT;',''));
    assert.equal((await db.query('SELECT * FROM clubs JOIN club_members ON club_id=id')).rowCount,2);
  }finally{await db.query('ROLLBACK');await db.end();}
});
