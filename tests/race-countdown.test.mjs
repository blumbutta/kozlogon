import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceCountdown} from '../src/race-countdown.js';
import {createGameAudio} from '../src/game-audio.js';

function fixture(){const ticks=[],starts=[];return{ticks,starts,timer:createRaceCountdown({onTick:value=>ticks.push(value),onGo:()=>starts.push('go')})};}

test('ten-second authoritative countdown plays each count once and one starting signal',()=>{
 const {timer,ticks,starts}=fixture();
 for(let remaining=10;remaining>=1;remaining--){assert.equal(timer.update('countdown',remaining,10000-remaining*1000),String(remaining));timer.update('countdown',remaining-.3,10300-remaining*1000);}
 assert.deepEqual(ticks,[10,9,8,7,6,5,4,3,2,1]);assert.equal(timer.go(10000),true);
 assert.equal(timer.update('racing',0,10020),'СТАРТ!');assert.equal(timer.go(10030),false);timer.update('racing',0,10040);assert.deepEqual(starts,['go']);
 assert.equal(timer.update('racing',0,10801),'');
});

test('repeated or skipped snapshots do not repeat ticks or replay earlier seconds',()=>{
 const {timer,ticks}=fixture();timer.update('countdown',10,0);timer.update('countdown',10,30);timer.update('countdown',9.8,60);timer.update('countdown',6.9,100);timer.update('countdown',6.8,120);timer.update('countdown',7.1,130);
 assert.deepEqual(ticks,[10,7]);
 const late=fixture();assert.equal(late.timer.update('countdown',2.4,0),'3');assert.deepEqual(late.ticks,[3]);
});

test('spectators joining an already running race do not hear historical countdown or start',()=>{
 const {timer,ticks,starts}=fixture();assert.equal(timer.update('racing',-5,0),'');assert.equal(timer.go(20),false);assert.deepEqual(ticks,[]);assert.deepEqual(starts,[]);
});

test('state transition can provide a missed go event and new race resets its cues',()=>{
 const {timer,ticks,starts}=fixture();timer.update('countdown',1,0);assert.equal(timer.update('racing',0,1000),'СТАРТ!');timer.go(1020);assert.deepEqual(starts,['go']);
 assert.equal(timer.update('finished',0,1100),'');timer.reset();assert.equal(timer.update('countdown',10,2000),'10');assert.deepEqual(ticks,[1,10]);
});

test('countdown tones climb over the final three counts and go uses a distinctive chord',()=>{
 const original=globalThis.AudioContext,frequencies=[];
 const parameter=()=>({value:0,setValueAtTime(value){this.value=value;},cancelScheduledValues(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(){},disconnect(){},start(){},stop(){}});
 class AudioContext{
  currentTime=0;sampleRate=1000;destination=node();resume(){return Promise.resolve();}
  createGain(){return{...node(),gain:parameter()};}
  createBiquadFilter(){return{...node(),frequency:parameter(),Q:parameter()};}
  createBufferSource(){return node();}
  createBuffer(channels,length){const data=Array.from({length:channels},()=>new Float32Array(length));return{getChannelData:index=>data[index]};}
  createOscillator(){const frequency=parameter();frequency.setValueAtTime=value=>{frequency.value=value;frequencies.push(value);};return{...node(),frequency};}
 }
 globalThis.AudioContext=AudioContext;
 try{
  const audio=createGameAudio();assert.equal(audio.enable(true),true);
  for(const count of [10,3,2,1])assert.equal(audio.raceCountdown(count),true);
  assert.deepEqual(frequencies,[784,1047,1175,1319]);assert.equal(audio.raceCountdown(0),true);assert.deepEqual(frequencies.slice(-2),[1568,784]);audio.enable(false);
 }finally{if(original===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=original;}
});
