const families={
 hell:{goat:['Черти',['Багрянец','Шип','Уголёк','Рогатый','Клык'],0xc03c40],cow:['Гаргульи',['Гранит','Скрежет','Пепел','Камнекрыл','Обсидиан'],0x837386],deer:['Ифриты',['Искра','Жар','Пламя','Факел','Инферно'],0xf37624],moose:['Теневые',['Мрак','Шёпот','Бездна','Дым','Нокт'],0x7656a6]},
 moon:{goat:['Зелёные',['Зиг','Блип','Квак','Флу','Орбит'],0x71d6ad],cow:['Циклопы',['Око','Пикс','Луп','Зум','Блик'],0xb4a2e4],deer:['Щупальцы',['Спрут','Плюм','Желе','Тент','Слизь'],0x5acadd],moose:['Киборги',['Болт','Хром','Кварк','Реле','Ион'],0xa9bacb]}
};
export const WORLD_LOOKS={
 alps:{sky:0xb9d8df,hemi:0xdaf1ff,groundLight:0x769052,sun:0xfff0d5,sunIntensity:3.1,exposure:1.13,lift:0,route:0xf0f4ec,rock:0x959886,upperRock:0xaab6ae,upper:0xd9e3da,middle:0x7e9b66,lower:0xa5b979,sections:['КАМЕННАЯ ВЕРШИНА','ДИКИЙ ЛЕС','ГОРНАЯ ДЕРЕВНЯ','НИЖНИЙ СКЛОН'],journey:'ВЕРШИНА → ЛЕС → ДЕРЕВНЯ → ДОЛИНА',blood:0xb70722,stain:0x890617,vehicle:'СНЕГОХОД',description:'Лес, деревня и дикий горный спуск',families:{goat:'Козлы',cow:'Коровы',deer:'Олени',moose:'Лоси'}},
 hell:{sky:0x341821,hemi:0xffb472,groundLight:0x491829,sun:0xff8150,sunIntensity:2.3,exposure:1.25,lift:4,route:0x793d4c,rock:0x45313b,upperRock:0x503642,upper:0x3f2938,middle:0x5c3038,lower:0x713d38,sections:['КРАТЕР ВУЛКАНА','ОБСИДИАНОВЫЙ ЛЕС','КРЕПОСТЬ ДЕМОНОВ','ОГНЕННАЯ ДОЛИНА'],journey:'ВУЛКАН → ОБСИДИАН → КРЕПОСТЬ → ЛАВА',blood:0xff5238,stain:0x79182a,vehicle:'ОГНЕННЫЙ СКУТЕР',description:'Демоны, вулканы и текучая лава',families:Object.fromEntries(Object.entries(families.hell).map(([key,value])=>[key,value[0]]))},
 moon:{sky:0x080d27,hemi:0xc5d9ff,groundLight:0x59638d,sun:0xd5e6ff,sunIntensity:2.8,exposure:1.18,lift:8,route:0x9eabc9,rock:0x767e9c,upperRock:0x969bb5,upper:0xc2c6d6,middle:0xa1a7bf,lower:0xb2b6cf,sections:['ЛУННАЯ ВЕРШИНА','КРИСТАЛЬНЫЕ ПОЛЯ','БАЗА ПРИШЕЛЬЦЕВ','МОРЕ СПОКОЙСТВИЯ'],journey:'КРАТЕР → КРИСТАЛЛЫ → БАЗА → ЛУННОЕ МОРЕ',blood:0x64e7ad,stain:0x305d57,vehicle:'ЛУННЫЙ СКУТЕР',description:'Пришельцы и ещё более слабая гравитация',families:Object.fromEntries(Object.entries(families.moon).map(([key,value])=>[key,value[0]]))}
};
export function worldCharacters(original,world){
 if(world.id==='alps')return original;
 return original.map(def=>{const [label,names,fur]=families[world.id][def.species];return {...def,theme:world.id,speciesName:label,name:names[def.variant],furColor:fur};});
}
export function weatherLook(world,weather){
 const look=WORLD_LOOKS[world.id],kind=weather.kind;
 if(world.id==='alps')return {color:kind==='storm'?0x4d6371:kind==='rain'?0x8faab5:kind==='snow'?0xc9d8dc:look.sky,sun:kind==='storm'?.8:kind==='rain'?1.2:kind==='snow'?1.8:look.sunIntensity,fogFar:kind==='snow'?270:kind==='rain'?330:430,streaks:['rain','storm'].includes(kind),particles:kind==='snow',rain:0xc2ecff,particle:0xffffff};
 if(world.id==='hell')return {color:kind==='storm'?0x231320:kind==='rain'?0x312028:look.sky,sun:kind==='storm'?1.1:look.sunIntensity,fogFar:420,streaks:kind==='rain',particles:['snow','storm'].includes(kind),rain:0xe1ff68,particle:kind==='storm'?0xff7433:0xad9699};
 return {color:look.sky,sun:kind==='storm'?1.7:look.sunIntensity,fogFar:530,streaks:kind==='rain',particles:['snow','storm'].includes(kind),rain:0xffbf68,particle:kind==='storm'?0x7df5fc:0xc4cdf0};
}
export function victimNames(world){
 const base={goat:'Козлы',cow:'Коровы',deer:'Олени',moose:'Лоси',racer:'Соперники',yeti:'Йети',squirrel:'Белки',marmot:'Сурки',skier:'Лыжники',bear:'Медведи',hunter:'Охотники'};
 if(world.id==='alps')return base;
 return {...base,...WORLD_LOOKS[world.id].families,yeti:world.hazardNames.yeti,bear:world.hazardNames.bear,hunter:world.hazardNames.hunter,squirrel:world.id==='hell'?'Бесёнки':'Лунные слизни',marmot:world.id==='hell'?'Малые демоны':'Крабы-пришельцы',skier:world.id==='hell'?'Демоны-наездники':'Пришельцы-сёрферы'};
}
