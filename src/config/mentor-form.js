export const termsVersion='2026-11-21';
export const steps=['Identity','Teaching','Evidence','Declaration','Promises'];
export const promises=['I teach education, not tips.', "I won’t promise returns.", "I won’t sell signals or calls.",'I accept the mentor code of conduct and the terms.'];
// Field name, label, control, choices or maximum length.
export const fields=[
 [['full_name','Full name','text',100],['display_name','Display name','text',80],['phone','Phone','tel',30],['country','Country','text',80],['city','City','text',80]],
 [['topics','Topics','multi',['Risk management','Journaling','Trading psychology','Options basics','Technical analysis basics','Other']],['other_topic','Other topic','text',100],['markets','Markets','multi',['Equity','F&O','Forex','Commodities','Crypto','Other']],['levels','Student level','multi',['Beginner','Intermediate','Advanced']],['languages','Teaching languages','list',12],['bio','Trading and teaching experience','textarea',600]],
 [['evidence_links','Teaching evidence links','links',8],['sample_link','Sample lesson or syllabus','url',1000],['certifications','Certifications','textarea',400],['past_students_self_reported','Past students (self-reported)','number',1000000]],
 [['sebi_registered','Are you registered with SEBI as an investment adviser or research analyst?','boolean'],['sebi_reg_number','Registration number','text',60],['sebi_verify_url','Registration verification link','url',1000],['education_only_ack','I will teach education only and will not give tips, calls or recommendations.','check']],
 [['promises','Mentor promises','multi',promises]]
];
export function validLink(s){try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
export function mentorFieldApplies(key,data){
 if(key==='other_topic')return Array.isArray(data.topics)&&data.topics.includes('Other');
 if(key==='sebi_reg_number'||key==='sebi_verify_url')return data.sebi_registered===true;
 if(key==='education_only_ack')return data.sebi_registered===false;
 return true;
}
export function sectionError(data,step){
 for(const [k,label,type,limit] of fields[step]){
  if(!mentorFieldApplies(k,data))continue;
  const v=data[k];
  if(v==null || (typeof v==='string'&&!v.trim()) || (Array.isArray(v)&&!v.length))
    return 'Complete the field “'+label+'”.';
  if(type==='multi'&&(!Array.isArray(v)||v.length>limit.length||v.some(x=>!limit.includes(x))))return 'Check '+label+'.';
  if(['list','links'].includes(type)&&(!Array.isArray(v)||v.length>limit||v.some(x=>typeof x!=='string'||!x.trim()||x.length>(type==='links'?1000:50)||(type==='links'&&!validLink(x)))))return 'Check '+label+'.';
  if(['text','tel','url','textarea'].includes(type)&&(typeof v!=='string'||v.length>limit||(type==='url'&&!validLink(v))))return 'Check '+label+'.';
  if(type==='number'&&(!Number.isInteger(v)||v<0||v>limit))return 'Enter a valid student count.';
  if(['boolean','check'].includes(type)&&typeof v!=='boolean')return 'Check '+label+'.';
 }
 if(step===0&&(!data.full_name?.trim()||!data.display_name?.trim()))return 'Enter both names.';
 if(step===1&&(!['topics','markets','levels','languages'].every(k=>data[k]?.length)||data.bio?.trim().length<50||!data.bio||(data.topics.includes('Other')&&!data.other_topic?.trim())))return 'Choose your teaching details and write a bio of 50–600 characters.';
 if(step===2&&!data.evidence_links?.length)return 'Add at least one link to your teaching.';
 if(step===3&&(typeof data.sebi_registered!=='boolean'||(data.sebi_registered?(!data.sebi_reg_number?.trim()||!validLink(data.sebi_verify_url)):data.education_only_ack!==true)))return 'Complete the registration declaration.';
 if(step===4&&!promises.every(s=>data.promises?.includes(s)))return 'Accept all four promises to submit.';
 return '';
}
