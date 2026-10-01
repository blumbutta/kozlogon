const alpsWeather=[
 {kind:'sun',name:'Солнечно',icon:'☀',effect:'Хорошее сцепление',grip:.5,drag:.06,wind:0,steer:1,lateralGrip:3.2},
 {kind:'wind',name:'Порывы ветра',icon:'≋',effect:'Сильный боковой ветер',grip:.45,drag:.06,wind:8.5,steer:1,lateralGrip:2.6},
 {kind:'rain',name:'Дождь',icon:'☂',effect:'Лёгкий занос на мокром склоне',grip:.14,drag:.035,wind:1.8,steer:.9,lateralGrip:1.5},
 {kind:'storm',name:'Гроза',icon:'ϟ',effect:'Частые молнии · опасная зона 12 м',grip:.18,drag:.04,wind:6.8,steer:.92,lateralGrip:1.8},
 {kind:'snow',name:'Снег',icon:'❄',effect:'Мягкий снег тормозит',grip:.36,drag:.085,wind:2.5,steer:.94,lateralGrip:2.9}
];
const themedWeather=(names,overrides={})=>alpsWeather.map((weather,i)=>({...weather,...overrides[weather.kind],name:names[i]}));

export const WORLDS=[
 {id:'alps',title:'Дикие Альпы',gravityScale:.72,weather:alpsWeather,hazardNames:{bear:'Медведь',hunter:'Охотник',gunner:'Пулемётчик',yeti:'Йети',spikes:'Пики в яме!',lava:'Лава',lightning:'Молния!',cluster:'Кассетная бомба'}},
 {id:'hell',title:'Кальдера Ада',gravityScale:.72,weather:themedWeather(['Пекло','Огненный ветер','Кислотный ливень','Адская гроза','Пеплопад']),hazardNames:{bear:'Адский зверь',hunter:'Демон-стрелок',gunner:'Инфернальный пулемётчик',yeti:'Огромный демон',spikes:'Адская ловушка!',lava:'Лава',lightning:'Адская молния!',cluster:'Инфернальная кассетная бомба'}},
 {id:'moon',title:'Лунный Хребет',gravityScale:.5,weather:themedWeather(['Звёздный свет','Солнечный ветер','Метеорный дождь','Ионная буря','Лунная пыль'],{snow:{drag:.06}}),hazardNames:{bear:'Чужой хищник',hunter:'Пришелец-стрелок',gunner:'Инопланетный пулемётчик',yeti:'Космический великан',spikes:'Шипы в кратере!',lava:'Лава',lightning:'Ионный разряд!',cluster:'Инопланетная кассетная бомба'}}
];

export function resolveWorld(id){return WORLDS.find(world=>world.id===id)||WORLDS[0];}
let activeWorld=resolveWorld(typeof location!=='undefined'?new URLSearchParams(location.search).get('mountain'):'alps');
export function getActiveWorld(){return activeWorld;}
export function setActiveWorld(id){activeWorld=resolveWorld(id);return activeWorld;}
