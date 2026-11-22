export const setupFields = [
  ['name','Name',100],['rule','Your rule in one line',200],['how','How you trade it',600],
  ['tag','Handwritten note on the card',80],['hard','Hardest part',200],
  ['checks','Entry rules (one per line)',400],['note','A line from your journal',350],
];
export const setupColors = ['#5b6ee1','#17724a','#c75a1b','#7a3fe0','#c4284d'];
export const portfolioGroups = {
  hello:'Introduction',education:'Badges and courses',markets:'Markets',process:'Process stats',
  tools:'Tools',rules:'Rules',books:'Books',playbook:'Playbook',lessons:'Lessons',closing:'Closing note',
};
export function portfolioSetups(sections = {}) {
  if (Array.isArray(sections.presentation?.setups)) return sections.presentation.setups;
  return (sections.content?.playbook || '').split(/\r?\n/).map(line=>{
    const [name,rule='',...note]=line.split('|');
    return {name:name.trim(),rule:rule.trim(),note:note.join('|').trim()};
  }).filter(s=>s.name);
}
