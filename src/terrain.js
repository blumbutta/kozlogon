export const LENGTH=2200, CELL=3, MIN_X=-135, MAX_X=135, MIN_S=-60, MAX_S=2400;
export const center=s=>Math.sin(s/170)*22+Math.sin(s/63)*4;
export const height=s=>650-s*.53+Math.sin(s/110)*7+Math.sin(s/23)*1.7;
export function baseTerrainHeight(x,s){const offset=x-center(s);const ridge=Math.max(0,Math.abs(offset)-22)*.12;const swell=Math.sin(s*.105+x*.073)*2.4+Math.sin(s*.23-x*.16)*1.1+Math.cos(x*.29+s*.061)*.8;const ledges=Math.sin(s*.042+x*.017)*2.4-2.8*Math.tanh(Math.sin(s*.055+x*.012)*4.5);return height(s)+ridge+offset*offset*.0013+swell+ledges;}
export const SPIKE_PITS=Array.from({length:11},(_,i)=>({id:i,s:260+i*172,x:(i%3-1)*6,r:4.8+(i%2)*.6,depth:5.5+(i%3)*.35}));
export function terrainHeight(x,s){let y=baseTerrainHeight(x,s);for(const pit of SPIKE_PITS){if(Math.abs(s-pit.s)>pit.r)continue;const d=Math.hypot(x-center(pit.s)-pit.x,s-pit.s);if(d<pit.r)y-=pit.depth*Math.pow(Math.cos(d/pit.r*Math.PI/2),2);}return y;}
export function terrainData(){const data=[];for(let x=MIN_X;x<=MAX_X;x+=CELL){const row=[];for(let s=MIN_S;s<=MAX_S;s+=CELL)row.push(terrainHeight(x,s));data.push(row);}return data;}
// Match the triangles used by both the rendered ground and Cannon heightfield.
export function sampleGroundHeight(x,s){
 const ix=Math.floor((x-MIN_X)/CELL),is=Math.floor((s-MIN_S)/CELL);
 const x0=MIN_X+ix*CELL,s0=MIN_S+is*CELL,u=(x-x0)/CELL,v=(s-s0)/CELL;
 const a=terrainHeight(x0,s0),b=terrainHeight(x0+CELL,s0),c=terrainHeight(x0,s0+CELL),d=terrainHeight(x0+CELL,s0+CELL);
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
