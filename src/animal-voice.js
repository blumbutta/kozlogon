// Local formant synthesis keeps animal calls available in the offline download.
export function playAnimalVoice(audio,species,volume=.07,variant=0){
 if(!audio)return;
 const now=audio.currentTime;
 const config={goat:{pitch:165,length:.8,formants:[750,1550],vibrato:17,rate:9},cow:{pitch:82,length:1.05,formants:[430,850],vibrato:4,rate:4},deer:{pitch:320,length:.72,formants:[1200,2100],vibrato:22,rate:7},moose:{pitch:58,length:.9,formants:[310,620],vibrato:7,rate:6}}[species]||{pitch:165,length:.8,formants:[750,1550],vibrato:17,rate:9};
 const voice=audio.createOscillator(),envelope=audio.createGain();voice.type='sawtooth';
 const pitch=config.pitch*(.94+variant*.025);voice.frequency.setValueAtTime(pitch,now);voice.frequency.linearRampToValueAtTime(pitch*1.12,now+.12);voice.frequency.exponentialRampToValueAtTime(pitch*.72,now+config.length);
 envelope.gain.setValueAtTime(0,now);envelope.gain.linearRampToValueAtTime(volume,now+.06);envelope.gain.setValueAtTime(volume*.75,now+config.length*.65);envelope.gain.exponentialRampToValueAtTime(.001,now+config.length);envelope.connect(audio.destination);
 for(const frequency of config.formants){const filter=audio.createBiquadFilter();filter.type='bandpass';filter.frequency.setValueAtTime(frequency,now);filter.Q.value=5;voice.connect(filter);filter.connect(envelope);}
 const wobble=audio.createOscillator(),depth=audio.createGain();wobble.frequency.value=config.rate;depth.gain.value=config.vibrato;wobble.connect(depth);depth.connect(voice.frequency);
 voice.start(now);wobble.start(now);voice.stop(now+config.length);wobble.stop(now+config.length);voice.onended=()=>{voice.disconnect();wobble.disconnect();depth.disconnect();envelope.disconnect();};
}
