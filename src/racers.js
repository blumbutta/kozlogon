const species = [
 ['goat','Козёл',['Борис','Зефир','Рогач','Снежок','Черныш'],[0xf1e9d4,0xd3ab80,0x8f7762,0xe5edf1,0x554f48]],
 ['cow','Корова',['Бурёнка','Милка','Ириска','Пятнышко','Ночка'],[0xf5eee0,0xb97948,0xdbad72,0xd5d7d3,0x49413b]],
 ['deer','Олень',['Бэмби','Рыжик','Ветвистый','Песчаник','Туман'],[0xc99459,0xa86134,0x79604c,0xd9bd88,0x969b96]],
 ['moose','Лось',['Сохатый','Буран','Кедр','Гром','Север'],[0x765746,0xa9927b,0x4b3f36,0x9a6b4a,0xbec2b7]]
];
export const CHARACTERS = species.flatMap(([kind,label,names,fur])=>names.map((name,variant)=>({
 id:kind+'-'+variant,species:kind,speciesName:label,variant,name,furColor:fur[variant],
 color:[0xd6fc64,0xff8666,0x6ecafa,0xc99dff,0xffd86a][variant]
})));
export const RACER_COUNT = CHARACTERS.length;
export function rosterFor(selectedId){
 const selected=CHARACTERS.find(c=>c.id===selectedId)||CHARACTERS[0];
 return [selected,...CHARACTERS.filter(c=>c.id!==selected.id)];
}
export function spawnPosition(index){return {x:[0,-3.3,3.3,-6.6,6.6][index%5],s:-Math.floor(index/5)*4.2};}
