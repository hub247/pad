'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const LIBS=['agudo','ambrose','angel','atmospheric','bethel','cinematic','elevation','gateway','hillsong','motion','new','rhodes','shimmer','stoutcreek','warm','worship'];
const MODES={both:'Pad + metrônomo',pad:'Somente pad',metro:'Somente metrônomo',prepare:'Apenas preparar'};
const DEFAULTS={lib:'worship',note:'C',bpm:80,meter:'4x4',fadeIn:4,fadeOut:4,padVol:80,metroVol:40,padLoop:true,metroLoop:true,theme:false,fav:[],favLibs:[],hist:[],tourDone:false,installDismissed:false,tab:'play'};
function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key));return v===null?fallback:v}catch{return fallback}}
let storageWarned=false;
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{if(!storageWarned){storageWarned=true;toast('Armazenamento indisponível. Os dados ficam apenas nesta sessão.',true)}return false}}
const oldPrefs=read('pad-v12',null)||read('pad-v11',null)||read('pad-v10',null)||read('pad-v9',null)||read('pad-v8',{});
const state={...DEFAULTS,...oldPrefs};
state.fadeIn=Number(oldPrefs.fadeIn??oldPrefs.fi??oldPrefs.fade??4);state.fadeOut=Number(oldPrefs.fadeOut??oldPrefs.fo??oldPrefs.fade??4);
if(!LIBS.includes(state.lib))state.lib='worship';if(!NOTES.includes(state.note))state.note='C';
state.bpm=Math.max(30,Math.min(240,Number(state.bpm)||80));
for(const k of ['fav','favLibs','hist'])if(!Array.isArray(state[k]))state[k]=[];
const uid=()=>globalThis.crypto?.randomUUID?.()||'s-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const oldSongs=read('pad-v12-set',null)??read('pad-v11-set',null)??read('pad-v10-set',null)??read('pad-v9-set',null)??read('pad-v8-set',[]);
let songs=(Array.isArray(oldSongs)?oldSongs:[]).map(s=>({id:s.id||uid(),name:s.name||s.nome||'Sem título',mode:MODES[s.mode]?s.mode:'both',lib:LIBS.includes(s.lib)?s.lib:'worship',note:NOTES.includes(s.note)?s.note:'C',bpm:Math.max(30,Math.min(240,Number(s.bpm)||80)),meter:['1x4','2x4','3x4','4x4'].includes(s.meter)?s.meter:'4x4',padVol:s.padVol??80,metroVol:s.metroVol??40,padLoop:s.padLoop!==false,metroLoop:s.metroLoop!==false}));
const previousSession=read('pad-v12-session',null);
let currentId=null,preparedId=null,editingId=null,copyPrefs=read('pad-v12-copy',{}),pad=null,metro=null,pendingPad=null,pendingMetro=null,padToken=0,metroToken=0,loadingNote=null,toastTimer,context=null,installPrompt=null,taps=[],tourStep=0,restoring=false;
const tracks=new Set();
const save=()=>store('pad-v12',state), saveSongs=()=>store('pad-v12-set',songs);
const title=s=>s?String(s)[0].toUpperCase()+String(s).slice(1):'';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isIOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function toast(text,error=false){clearTimeout(toastTimer);const el=$('#toast');el.textContent=text;el.classList.toggle('error',error);el.classList.remove('hidden');toastTimer=setTimeout(()=>el.classList.add('hidden'),2800)}
function haptic(){try{navigator.vibrate?.(8)}catch{}}
function openDialog(id){const d=$(id);if(!d.open)d.showModal()}
function closeDialog(d){if(d?.open)d.close()}
function getSong(id){return songs.find(s=>s.id===id)}
function padURL(lib,note){return 'audio/pad/'+encodeURIComponent(lib)+'/'+encodeURIComponent(lib+'-'+note)+'.mp3'}
function metroURL(meter){return 'audio/metronomo/0030bpm_'+meter+'.mp3'}

// Ganho por voz: fade real, sem depender do volume do elemento no iOS.
let resumePadOnGesture=false;
function audioOutputError(){return Object.assign(new Error('A saída de áudio não foi liberada pelo navegador.'),{name:'AudioOutputError'})}
function audioContext(){
 const C=window.AudioContext||window.webkitAudioContext;
 if(!C)throw audioOutputError();
 if(!context||context.state==='closed'){
  context=new C();
  context.addEventListener('statechange',()=>{const status=$('#now-status');if(pad&&status)status.textContent=context.state==='running'&&!pad.audio.paused?'● Pad tocando':'Áudio suspenso • toque para retomar';if(context.state!=='running')$$('.pad.playing').forEach(el=>el.classList.remove('playing'))});
 }
 return context;
}
function resumeOutput(ctx=audioContext()){
 if(ctx.state==='running')return Promise.resolve();
 let resumed;
 try{resumed=ctx.resume()}catch(error){return Promise.reject(audioOutputError())}
 // A chamada resume acontece no próprio gesto, antes de qualquer await ou rede.
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);ctx.removeEventListener('statechange',check);error?reject(error):resolve()};
  const check=()=>{if(ctx.state==='running')finish();else if(ctx.state==='closed')finish(audioOutputError())};
  const timer=setTimeout(()=>finish(audioOutputError()),5000);
  ctx.addEventListener('statechange',check);
  Promise.resolve(resumed).then(()=>{if(ctx.state==='running')finish();else finish(audioOutputError())},()=>finish(audioOutputError()));
  check();
 });
}
function unlockAudioGesture(){
 try{
  const ctx=audioContext();
  if(pad&&ctx.state!=='running')resumePadOnGesture=true;
  // Buffer silencioso curto apenas para ativar a saída no gesto de toque.
  const source=ctx.createBufferSource();source.buffer=ctx.createBuffer(1,1,ctx.sampleRate);source.connect(ctx.destination);source.onended=()=>source.disconnect();source.start(0);
  resumeOutput(ctx).catch(()=>{});
 }catch{}
}
function makeTrack(url,kind){
 const ctx=audioContext(),outputReady=resumeOutput(ctx),audio=new Audio();
 outputReady.catch(()=>{});
 audio.preload='auto';audio.playsInline=true;audio.setAttribute('playsinline','');audio.setAttribute('webkit-playsinline','');audio.muted=false;audio.volume=1;audio.hidden=true;audio.setAttribute('aria-hidden','true');document.body.appendChild(audio);
 // CORS é definido ANTES de src para evitar uma fonte Web Audio silenciosa em redirecionamentos.
 audio.crossOrigin='anonymous';
 const source=ctx.createMediaElementSource(audio),gain=ctx.createGain();gain.gain.value=0;
 source.connect(gain);gain.connect(ctx.destination);audio.src=url;
 const t={audio,source,gain,kind,outputReady,level:0,envelope:null,disposed:false,timer:null};tracks.add(t);return t;
}
// Ativação compartilhada: notas, setlist, teclado e botões de reprodução.
function audioGesture(event){
 const el=event.target instanceof Element?event.target:null;
 if(!el)return;
 const trigger=el.closest('[data-note],[data-history],.song-info,[data-action="both"],[data-action="toggle-metro"],[data-action="play-prepared"],[data-action="stage-next"]');
 if(trigger)unlockAudioGesture();
}
document.addEventListener('pointerdown',audioGesture,{capture:true,passive:true});
document.addEventListener('click',audioGesture,true);
document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key))audioGesture(event)},true);
function levelAt(t){const e=t.envelope;if(!e)return t.level;const p=Math.max(0,Math.min(1,(context.currentTime-e.start)/e.seconds));return e.from+(e.to-e.from)*(p*p*(3-2*p))}
function dispose(t){if(!t||t.disposed)return;t.disposed=true;t.cancelLoad?.();clearTimeout(t.timer);t.audio.pause();try{t.audio.currentTime=0;t.audio.removeAttribute('src');t.audio.load();t.audio.remove();t.source.disconnect();t.gain.disconnect()}catch{}tracks.delete(t)}
function ramp(t,to,seconds,finish){if(!t||t.disposed)return;clearTimeout(t.timer);const ctx=audioContext(),from=levelAt(t),start=ctx.currentTime,duration=Math.max(.03,Number(seconds)||.03);const param=t.gain.gain;param.cancelScheduledValues(start);param.setValueAtTime(from,start);const curve=new Float32Array(129);for(let i=0;i<curve.length;i++){const p=i/(curve.length-1);curve[i]=from+(to-from)*(p*p*(3-2*p))}param.setValueCurveAtTime(curve,start,duration);t.envelope={from,to,start,seconds:duration};t.level=to;
 const complete=()=>{if(t.disposed)return;if(ctx.currentTime<start+duration-.015){t.timer=setTimeout(complete,100);return}t.envelope=null;if(finish){finish();render()}};t.timer=setTimeout(complete,duration*1000+35)}
function setLevel(t,v){if(t&&!t.disposed)ramp(t,Math.max(0,Math.min(1,v)),.08)}
function audioError(kind,url,error){if(error?.name==='AudioOutputError')toast('A saída de áudio não foi liberada. Toque novamente na nota ou na música.',true);else if(error?.name==='NotAllowedError')toast('Toque novamente para liberar o áudio.',true);else toast('Arquivo não encontrado ou inválido: '+decodeURIComponent(url),true)}
const padPathCache=new Map();
const PAD_LOAD_LIMITS={idle:30000,total:180000};
function padCandidates(lib,note){
 const cached=padPathCache.get(lib+'|'+note),flat={'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb'}[note];
 const roots=[lib,title(lib)],names=[lib+'-'+note,note,title(lib)+'-'+note,lib+'_'+note,lib+' '+note];
 if(flat)names.push(lib+'-'+flat,flat,title(lib)+'-'+flat);
 const paths=[cached,padURL(lib,note)];
 for(const folder of roots)for(const name of names)paths.push('audio/pad/'+encodeURIComponent(folder)+'/'+encodeURIComponent(name)+'.mp3');
 paths.push('audio/pad/'+encodeURIComponent(lib)+'/'+encodeURIComponent(lib+'-'+note)+'.MP3');
 return [...new Set(paths.filter(Boolean))];
}
function waitPadPlayback(t){
 return new Promise((resolve,reject)=>{
  const audio=t.audio;let settled=false,timer,lastProgress=performance.now(),lastBuffered=0,lastReady=audio.readyState;
  const started=lastProgress;
  function cleanup(){clearInterval(timer);for(const [event,handler] of listeners)audio.removeEventListener(event,handler);t.cancelLoad=null}
  function finish(error){if(settled)return;settled=true;cleanup();error?reject(error):resolve()}
  function abort(){finish(Object.assign(new Error('Carregamento cancelado'),{name:'AbortError'}))}
  function progress(){let end=0;try{if(audio.buffered.length)end=audio.buffered.end(audio.buffered.length-1)}catch{}if(end>lastBuffered||audio.readyState>lastReady){lastProgress=performance.now();lastBuffered=end;lastReady=audio.readyState}}
  function fail(){finish(Object.assign(new Error('Falha ao carregar áudio'),{name:'PadMediaError',mediaCode:audio.error?.code}))}
  const listeners=[['error',fail],['abort',abort],['progress',progress],['loadedmetadata',progress],['loadeddata',progress],['canplay',progress]];
  for(const [event,handler]of listeners)audio.addEventListener(event,handler);
  t.cancelLoad=abort;
  timer=setInterval(()=>{if(t.disposed)return abort();progress();const now=performance.now();if(now-lastProgress>PAD_LOAD_LIMITS.idle||now-started>PAD_LOAD_LIMITS.total)finish(Object.assign(new Error('Carregamento sem progresso'),{name:'PadLoadTimeout'}))},500);
  // V13: iniciar a mídia não basta. A saída Web Audio também precisa estar ativa.
  try{Promise.all([t.outputReady,Promise.resolve(audio.play())]).then(()=>{
   if(context?.state!=='running')throw audioOutputError();
   finish();
  }).catch(error=>finish(error))}catch(error){finish(error)}
 });
}
async function startPad(note=state.note,config={}){
 resumePadOnGesture=false;
 const lib=config.lib||state.lib,token=++padToken;
 if(pendingPad)dispose(pendingPad);pendingPad=null;loadingNote=note;render();
 let lastError=null,lastURL=padURL(lib,note);
 for(const url of padCandidates(lib,note)){
  if(token!==padToken)return false;
  let t;lastURL=url;
  try{
   t=makeTrack(url,'pad');pendingPad=t;t.note=note;t.lib=lib;t.audio.loop=config.loop??state.padLoop;
   t.audio.addEventListener('ended',()=>{if(pad===t&&!t.audio.loop){pad=null;dispose(t);render()}});
   await waitPadPlayback(t);
   if(token!==padToken){dispose(t);return false}
   pendingPad=null;loadingNote=null;const old=pad;pad=t;state.note=note;state.lib=lib;padPathCache.set(lib+'|'+note,url);save();
   ramp(t,(config.volume??state.padVol)/100,state.fadeIn);if(old)ramp(old,0,state.fadeOut,()=>dispose(old));
   const key=lib+'|'+note;state.hist=[key,...state.hist.filter(k=>k!==key)].slice(0,8);save();render();snapshot();return true;
  }catch(error){
   lastError=error;if(t)dispose(t);if(pendingPad===t)pendingPad=null;
   if(token!==padToken)return false;
   if(['NotAllowedError','AudioOutputError','PadLoadTimeout','AbortError'].includes(error.name))break;
  }
 }
 if(token===padToken){pendingPad=null;loadingNote=null;render();
  if(lastError?.name==='PadLoadTimeout')toast('O áudio não avançou no carregamento. Verifique a conexão e tente novamente: '+title(lib)+' '+note,true);
  else if(lastError?.name!=='AbortError')audioError('pad',lastURL,lastError);
 }
 return false;
}
function stopPad(){++padToken;if(pendingPad){dispose(pendingPad);pendingPad=null}loadingNote=null;pad=null;for(const t of tracks)if(t.kind==='pad')ramp(t,0,state.fadeOut,()=>dispose(t));render();snapshot()}
function togglePad(note){haptic();const resumeOnly=resumePadOnGesture;resumePadOnGesture=false;if(pad?.note===note&&pad?.lib===state.lib){if(resumeOnly||context?.state!=='running'||pad.audio.paused){Promise.all([resumeOutput(),pad.audio.play()]).then(()=>render()).catch(error=>audioError('pad',pad.audio.src,error))}else stopPad()}else startPad(note)}
async function startMetro(config={}){const token=++metroToken;if(pendingMetro)dispose(pendingMetro);const url=metroURL(config.meter||state.meter);let t;try{t=makeTrack(url,'metro');pendingMetro=t;t.audio.loop=config.loop??state.metroLoop;t.audio.playbackRate=(config.bpm??state.bpm)/30;t.audio.preservesPitch=true;t.audio.webkitPreservesPitch=true;t.audio.addEventListener('ended',()=>{if(metro===t&&!t.audio.loop){metro=null;dispose(t);render()}});await Promise.all([t.outputReady,t.audio.play()]);if(context?.state!=='running')throw audioOutputError();if(token!==metroToken){dispose(t);return false}pendingMetro=null;const old=metro;metro=t;setLevel(t,(config.volume??state.metroVol)/100);dispose(old);render();snapshot();return true}catch(e){if(t)dispose(t);if(token===metroToken){pendingMetro=null;audioError('metro',url,e)}return false}}
function stopMetro(){++metroToken;dispose(pendingMetro);pendingMetro=null;dispose(metro);metro=null;render();snapshot()}
function stopAll(){haptic();stopPad();stopMetro()}
function toggleMetro(){haptic();if(metro)stopMetro();else startMetro()}
function both(){haptic();const jobs=[];if(!pad)jobs.push(startPad());if(!metro)jobs.push(startMetro());return Promise.all(jobs)}
function setBPM(value,source){state.bpm=Math.max(30,Math.min(240,Math.round(Number(value))||30));save();if(metro)metro.audio.playbackRate=state.bpm/30;$$('.bpm-value').forEach(x=>x.textContent=state.bpm);$$('.bpm-range,.bpm-input').forEach(x=>{if(x!==source)x.value=state.bpm});$$('[data-bpm]').forEach(x=>x.classList.toggle('active',Number(x.dataset.bpm)===state.bpm));snapshot()}
function setMeter(meter){state.meter=meter;save();$$('[data-meter]').forEach(x=>x.classList.toggle('active',x.dataset.meter===meter));if(metro)startMetro()}
function tapTempo(){haptic();const now=performance.now();taps=taps.filter(t=>now-t<3000);taps.push(now);taps=taps.slice(-7);if(taps.length>1)setBPM(60000/((now-taps[0])/(taps.length-1)));else toast('Continue tocando no TAP para marcar o tempo.')}
function metroHTML(compact=false){const presets=[60,80,100,120,140].map(b=>`<button data-bpm="${b}">${b}</button>`).join('');return `<div class="metro-head">${compact?`<div class="bpm-display"><span class="bpm-value">${state.bpm}</span><small>BPM • <span class="meter-label">${state.meter.replace('x','/')}</span></small></div>`:'<h2>Metrônomo</h2>'}<span class="badge metro-status">Parado</span></div>${compact?'':`<div class="bpm-display"><span class="bpm-value">${state.bpm}</span><small>BPM</small></div>`}<input class="bpm-range" aria-label="Tempo do metrônomo" type="range" min="30" max="240" value="${state.bpm}">${compact?`<div class="stage-steps"><button class="step" data-step="-1" aria-label="Diminuir BPM">−</button>${presets}<button class="step" data-step="1" aria-label="Aumentar BPM">+</button></div>`:`<div class="step-row"><button class="step" data-step="-1" aria-label="Diminuir BPM">−</button><input class="input bpm-input" aria-label="BPM" type="number" min="30" max="240" value="${state.bpm}"><button class="step" data-step="1" aria-label="Aumentar BPM">+</button></div><div class="presets">${presets}</div><div class="meters">${['1x4','2x4','3x4','4x4'].map(m=>`<button data-meter="${m}">${m.replace('x','/')}</button>`).join('')}</div>`}<div class="metro-actions"><button class="btn primary" data-action="toggle-metro">▶ Metrônomo</button><button class="btn" data-action="tap">TAP</button></div>`}
function renderPads(){for(const [selector,favorites] of [['#pads',true],['#stage-pads',false]])$(selector).innerHTML=NOTES.map(n=>{const on=pad?.note===n&&pad?.lib===state.lib&&context?.state==='running'&&!pad.audio.paused;return `<button class="pad ${n===state.note?'selected':''} ${on?'playing':''}" data-note="${n}" aria-label="${n}${on?', tocando, toque para parar':''}">${n}${loadingNote===n?'<small>CARREGANDO</small>':on?'<small>TOCANDO</small>':''}${favorites?`<span role="button" tabindex="0" aria-label="Favoritar ${n}" class="favorite ${state.fav.includes(n)?'active':''}" data-favorite="${n}">★</span>`:''}</button>`}).join('')}
function renderFades(){$$('[data-fade]').forEach(row=>{const key=row.dataset.fade;row.innerHTML=`<span>${key==='fadeIn'?'Entrada':'Saída'}</span>`+[2,4,6,8].map(s=>`<button class="chip ${Number(state[key])===s?'active':''}" data-fade-key="${key}" data-seconds="${s}">${s}s</button>`).join('')})}
function renderHistory(){$('#history').innerHTML=state.hist.length?state.hist.map(k=>{const [l,n]=k.split('|');return `<button class="chip" data-history="${escapeHTML(k)}">${escapeHTML(title(l)+' '+n)}</button>`}).join(''):'<small>Os pads tocados aparecerão aqui.</small>'}
function describe(s){const parts=[MODES[s.mode]];if(s.mode!=='metro')parts.push(title(s.lib)+' '+s.note);if(['both','metro'].includes(s.mode))parts.push(s.bpm+' BPM',s.meter.replace('x','/'));return parts.join(' • ')}
function renderSongs(){$('#songs').innerHTML=songs.length?songs.map((s,i)=>`<div class="song ${s.id===currentId?'current':s.id===preparedId?'prepared':''}" data-song="${s.id}"><span>${i+1}</span><div class="song-info" tabindex="0" role="button" aria-label="Iniciar ${escapeHTML(s.name)}"><b>${escapeHTML(s.name)}</b><small>${escapeHTML(describe(s))}</small></div><div class="song-actions"><button class="mini" data-move="-1" data-id="${s.id}" aria-label="Subir música" ${i===0?'disabled':''}>▲</button><button class="mini" data-move="1" data-id="${s.id}" aria-label="Descer música" ${i===songs.length-1?'disabled':''}>▼</button><button class="mini" data-edit="${s.id}" aria-label="Editar música">✎</button><button type="button" class="mini delete-direct" data-delete="${s.id}" aria-label="Excluir música" title="Excluir música">×</button></div></div>`).join(''):'<p class="hint">Adicione a primeira música para montar seu roteiro.</p>'}
function prepareSong(id){const s=getSong(id);if(!s)return;preparedId=id;state.lib=s.lib;state.note=s.note;save();render();snapshot();toast(s.name+' preparada. O áudio atual não foi alterado.')}
let songToken=0;
async function runSong(id){const s=getSong(id);if(!s)return;const token=++songToken;haptic();preparedId=id;state.lib=s.lib;state.note=s.note;save();if(s.mode==='prepare'){render();snapshot();toast(s.name+' preparada, sem iniciar áudio.');return}currentId=id;setBPM(s.bpm);state.meter=s.meter;save();const jobs=[];if(['both','pad'].includes(s.mode))jobs.push(startPad(s.note,{lib:s.lib,volume:s.padVol,loop:s.padLoop}));else stopPad();if(['both','metro'].includes(s.mode))jobs.push(startMetro({bpm:s.bpm,meter:s.meter,volume:s.metroVol,loop:s.metroLoop}));else stopMetro();await Promise.all(jobs);if(token===songToken){render();snapshot()}}
function nextIndex(){if(!songs.length)return -1;const i=songs.findIndex(s=>s.id===(preparedId||currentId));return (i+1)%songs.length}
function prepareNext(){const i=nextIndex();if(i<0)return toast('Adicione uma música primeiro.',true);prepareSong(songs[i].id)}
function playPrepared(){if(!songs.length)return toast('Setlist vazia.',true);runSong(preparedId||songs[0].id)}
function stageNext(){if(!songs.length)return toast('Setlist vazia.',true);const i=songs.findIndex(s=>s.id===currentId);runSong(songs[(i+1)%songs.length].id)}
function moveSong(id,direction){const i=songs.findIndex(s=>s.id===id),j=i+direction;if(i<0||j<0||j>=songs.length)return;[songs[i],songs[j]]=[songs[j],songs[i]];saveSongs();render();snapshot()}
function openEditor(id=null){editingId=id;const s=getSong(id)||{name:'',mode:'both',lib:state.lib,note:state.note,bpm:state.bpm,meter:state.meter,padVol:state.padVol,metroVol:state.metroVol,padLoop:state.padLoop,metroLoop:state.metroLoop};$('#editor-title').textContent=id?'Editar música':'Nova música';$('#song-name').value=s.name;$('#song-lib').innerHTML=LIBS.map(l=>`<option value="${l}">${title(l)}</option>`).join('');$('#song-lib').value=s.lib;$('#song-note').innerHTML=NOTES.map(n=>`<option>${n}</option>`).join('');$('#song-note').value=s.note;$('#song-bpm').value=s.bpm;$('#song-meter').value=s.meter;$('#song-pad-volume').value=s.padVol;$('#song-metro-volume').value=s.metroVol;$('#song-pad-loop').checked=s.padLoop;$('#song-metro-loop').checked=s.metroLoop;$(`[name="mode"][value="${s.mode}"]`).checked=true;$('#delete-song').classList.toggle('hidden',!id);$('#song-form [type="submit"]').textContent=id?'Salvar alteração':'Salvar música';openDialog('#editor-dialog')}
$('#song-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#song-name').value.trim();if(!name)return toast('Informe o nome da música.',true);const s={id:editingId||uid(),name,mode:$('[name="mode"]:checked').value,lib:$('#song-lib').value,note:$('#song-note').value,bpm:Math.max(30,Math.min(240,Number($('#song-bpm').value)||80)),meter:$('#song-meter').value,padVol:Number($('#song-pad-volume').value),metroVol:Number($('#song-metro-volume').value),padLoop:$('#song-pad-loop').checked,metroLoop:$('#song-metro-loop').checked};const i=songs.findIndex(x=>x.id===editingId);if(i<0)songs.push(s);else songs[i]=s;saveSongs();closeDialog($('#editor-dialog'));render();toast('Música salva.')});
function requestDelete(id){const s=getSong(id);if(!s)return;editingId=id;$('#confirm-text').textContent='Deseja excluir definitivamente “'+s.name+'” da setlist? Essa ação não pode ser desfeita.';openDialog('#confirm-dialog')}
$('#delete-song').onclick=()=>requestDelete(editingId);
$('#confirm-delete').onclick=()=>{songs=songs.filter(s=>s.id!==editingId);delete copyPrefs[editingId];if(currentId===editingId)currentId=null;if(preparedId===editingId)preparedId=null;saveSongs();store('pad-v12-copy',copyPrefs);closeDialog($('#confirm-dialog'));closeDialog($('#editor-dialog'));render();snapshot();toast('Música excluída.')};
let longPress=null,suppressSongClick=null,pressStart=null;
$('#songs').addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const row=e.target.closest('[data-song]');if(!row)return;pressStart={x:e.clientX,y:e.clientY};clearTimeout(longPress);longPress=setTimeout(()=>{suppressSongClick=row.dataset.song;setTimeout(()=>suppressSongClick=null,1300);haptic();openEditor(row.dataset.song)},650)});
$('#songs').addEventListener('pointermove',e=>{if(pressStart&&Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y)>12)clearTimeout(longPress)});
for(const ev of ['pointerup','pointercancel','pointerleave'])$('#songs').addEventListener(ev,()=>{clearTimeout(longPress);pressStart=null});
$('#songs').addEventListener('contextmenu',e=>e.preventDefault());
$('#songs').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.closest('.song-info')){e.preventDefault();runSong(e.target.closest('[data-song]').dataset.song)}});
const COPY_FIELDS={name:'Nome',pad:'Tipo de pad',note:'Nota',metro:'Metrônomo',bpm:'BPM',meter:'Compasso'};
const COPY_PRESETS={names:['name'],pad:['name','pad'],padnote:['name','pad','note'],metro:['name','metro','bpm','meter'],both:['name','pad','metro','bpm'],all:Object.keys(COPY_FIELDS)};
function allowedFields(s){return ['name',...(s.mode!=='metro'?['pad','note']:[]),...(['both','metro'].includes(s.mode)?['metro','bpm','meter']:[])]}
function openCopy(){if(!songs.length)return toast('Adicione músicas antes de copiar.',true);$('#copy-preset').value='custom';$('#copy-fields').innerHTML=songs.map(s=>`<div class="copy-item"><b>${escapeHTML(s.name)}</b><div class="copy-checks">${Object.entries(COPY_FIELDS).map(([k,label])=>`<label><input type="checkbox" data-copy-id="${s.id}" data-field="${k}" ${allowedFields(s).includes(k)?(copyPrefs[s.id]?.[k]!==false?'checked':''):'disabled'}> ${label}</label>`).join('')}</div></div>`).join('');previewCopy();openDialog('#copy-dialog')}
function previewCopy(){const cfg={};$$('[data-copy-id]').forEach(x=>{(cfg[x.dataset.copyId]??={})[x.dataset.field]=x.checked&&!x.disabled});copyPrefs=cfg;store('pad-v12-copy',cfg);const blocks=songs.map((s,i)=>{const c=cfg[s.id]||{},a=[];if(c.name)a.push((i+1)+'. '+s.name);if(c.pad&&s.mode!=='metro')a.push('Pad: '+title(s.lib));if(c.note&&s.mode!=='metro')a.push('Nota: '+s.note);if(['both','metro'].includes(s.mode)){if(c.metro)a.push('Metrônomo: sim');if(c.bpm)a.push('BPM: '+s.bpm);if(c.meter)a.push('Compasso: '+s.meter.replace('x','/'))}return a.join('\n')}).filter(Boolean);$('#copy-preview').value=blocks.length?'SETLIST\n\n'+blocks.join('\n\n'):''}
$('#copy-fields').onchange=()=>{$('#copy-preset').value='custom';previewCopy()};
$('#copy-preset').onchange=e=>{const fields=COPY_PRESETS[e.target.value];if(!fields)return;$$('[data-copy-id]').forEach(x=>x.checked=!x.disabled&&fields.includes(x.dataset.field));previewCopy()};
async function writeClipboard(text){if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(text);return}catch{}}const ta=$('#copy-preview');ta.focus();ta.select();if(!document.execCommand('copy'))throw Error('Clipboard indisponível')}
$('#copy-confirm').onclick=async()=>{const text=$('#copy-preview').value;if(!text)return toast('Selecione pelo menos uma informação.',true);try{await writeClipboard(text);closeDialog($('#copy-dialog'));toast('Setlist copiada.')}catch{toast('Não foi possível copiar automaticamente. Selecione o texto da prévia.',true)}};
function renderLibraries(query=''){const q=query.toLowerCase();const fav=state.favLibs.filter(l=>LIBS.includes(l)&&l.includes(q)),rest=LIBS.filter(l=>!fav.includes(l)&&l.includes(q));const item=l=>`<div class="library-item"><button class="soft" data-library="${l}">${title(l)}${state.lib===l?' • atual':''}</button><button class="soft ${state.favLibs.includes(l)?'fav':''}" data-fav-lib="${l}" aria-label="Favoritar biblioteca">★</button></div>`;$('#libraries').innerHTML=(fav.length?'<h3>Favoritas</h3>'+fav.map(item).join(''):'')+'<h3>Bibliotecas</h3>'+rest.map(item).join('')+(!fav.length&&!rest.length?'<p>Nenhuma biblioteca encontrada.</p>':'')}
$('#library-search').oninput=e=>renderLibraries(e.target.value);
function showTab(tab){state.tab=['play','setlist','settings'].includes(tab)?tab:'play';$$('.view').forEach(v=>v.classList.toggle('active',v.id===state.tab));$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));save();snapshot()}
function openStage(){audioContextSafeResume();$('#stage').classList.remove('hidden');document.body.style.overflow='hidden';render();snapshot()}
function closeStage(){$('#stage').classList.add('hidden');document.body.style.overflow='';snapshot()}
function audioContextSafeResume(){if(context&&context.state!=='running')resumeOutput(context).catch(()=>{if(pad||metro)toast('Toque novamente para liberar a saída de áudio.',true)})}
function settingsUI(){$('#pad-volume').value=state.padVol;$('#metro-volume').value=state.metroVol;$('#pad-volume-label').textContent=state.padVol+'%';$('#metro-volume-label').textContent=state.metroVol+'%';$('#pad-loop').checked=state.padLoop;$('#metro-loop').checked=state.metroLoop;$('#red-theme').checked=state.theme;document.body.classList.toggle('red',state.theme)}
$('#pad-volume').oninput=e=>{state.padVol=Number(e.target.value);save();$('#pad-volume-label').textContent=state.padVol+'%';setLevel(pad,state.padVol/100)};
$('#metro-volume').oninput=e=>{state.metroVol=Number(e.target.value);save();$('#metro-volume-label').textContent=state.metroVol+'%';setLevel(metro,state.metroVol/100)};
$('#pad-loop').onchange=e=>{state.padLoop=e.target.checked;save();if(pad)pad.audio.loop=state.padLoop};
$('#metro-loop').onchange=e=>{state.metroLoop=e.target.checked;save();if(metro)metro.audio.loop=state.metroLoop};
$('#red-theme').onchange=e=>{state.theme=e.target.checked;save();document.body.classList.toggle('red',state.theme)};
async function offlineStatus(){try{if(!('caches'in window))throw Error();const keys=await caches.keys();let count=0;for(const k of keys.filter(k=>k.startsWith('pad-')&&k.includes('audio')))count+=(await(await caches.open(k)).keys()).length;$('#offline-count').textContent=count+' áudios';toast(count+' arquivo(s) de áudio em cache. Apenas arquivos já armazenados funcionam offline.')}catch{toast('Status offline indisponível neste contexto. Abra pelo endereço HTTPS.',true)}}
function installBanner(){const show=!installed()&&!state.installDismissed&&(installPrompt||isIOS)&&!pad&&!metro&&$('#stage').classList.contains('hidden');$('#install-banner').classList.toggle('hidden',!show);$$('.install-control').forEach(x=>x.classList.toggle('hidden',installed()))}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installBanner()});
window.addEventListener('appinstalled',()=>{installPrompt=null;state.installDismissed=true;save();installBanner()});
async function installApp(){if(installed())return toast('O Pad já está aberto como aplicativo.');if(installPrompt){const event=installPrompt;installPrompt=null;await event.prompt();installBanner();return}$('#install-instructions').textContent=isIOS?'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Confirme em “Adicionar”.':'Abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”. A opção depende do navegador e da publicação por HTTPS.';openDialog('#install-dialog')}
const HELP=[['Bem-vindo ao Pad','Escolha a biblioteca e toque em uma nota. Toque novamente na nota ativa para parar somente o pad.'],['Transições suaves','Acima das notas, escolha Entrada e Saída em 2, 4, 6 ou 8 segundos. A troca de nota faz crossfade.'],['Metrônomo','Use a barra larga, −/+, presets ou TAP. Escolha o compasso. O metrônomo pode tocar separado do pad.'],['Setlist','Adicione músicas com suas configurações. Toque para iniciar, segure para editar. As setas alteram a ordem.'],['Copiar e usar no palco','Copie somente os detalhes que quiser por música. No Modo Palco, pads e metrônomo ficam juntos. Use a trava para evitar toques acidentais.'],['Adicionar à tela inicial','Você pode instalar o Pad ou seguir as instruções do navegador. A instalação é opcional.']];
function showHelp(step=0){tourStep=step;$('#help-count').textContent=(step+1)+' / '+HELP.length;$('#help-title').textContent=HELP[step][0];$('#help-text').textContent=HELP[step][1];$('#help-next').textContent=step===HELP.length-1?'Concluir':'Próximo';$('#help-install').classList.toggle('hidden',step!==HELP.length-1||installed());openDialog('#help-dialog')}
function closeHelp(){if($('#help-never').checked){state.tourDone=true;save()}closeDialog($('#help-dialog'));if(previousSession&&!restoreOffered)offerRestore()}
$('#help-next').onclick=()=>tourStep<HELP.length-1?showHelp(tourStep+1):closeHelp();
$('#help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp()});
let unlockTimer;
$('#unlock').onpointerdown=e=>{e.preventDefault();$('#unlock').setPointerCapture(e.pointerId);$('#unlock').textContent='Mantenha pressionado…';unlockTimer=setTimeout(()=>{closeDialog($('#lock-dialog'));$('#unlock').textContent='Segure para desbloquear';haptic()},1200)};
for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('#unlock').addEventListener(ev,()=>{clearTimeout(unlockTimer);$('#unlock').textContent='Segure para desbloquear'});
$('#lock-dialog').addEventListener('cancel',e=>e.preventDefault());
function snapshot(){if(restoring)return;store('pad-v12-session',{lib:state.lib,note:state.note,bpm:state.bpm,meter:state.meter,tab:state.tab,currentId,preparedId,stage:!$('#stage').classList.contains('hidden'),scroll:window.scrollY,padPlaying:!!pad,metroPlaying:!!metro,savedAt:Date.now()})}
let restoreOffered=false;
function offerRestore(){if(restoreOffered||!previousSession)return;restoreOffered=true;restoring=true;$('#restore-description').textContent=title(previousSession.lib)+' • '+previousSession.note+' • '+previousSession.bpm+' BPM';openDialog('#restore-dialog')}
$('#restore-session').onclick=()=>{const s=previousSession;state.lib=LIBS.includes(s.lib)?s.lib:state.lib;state.note=NOTES.includes(s.note)?s.note:state.note;state.meter=s.meter||state.meter;currentId=getSong(s.currentId)?s.currentId:null;preparedId=getSong(s.preparedId)?s.preparedId:null;restoring=false;showTab(s.tab||'play');setBPM(s.bpm);if(s.stage)openStage();closeDialog($('#restore-dialog'));render();requestAnimationFrame(()=>window.scrollTo(0,s.scroll||0));snapshot();toast('Sessão restaurada. Toque para retomar o áudio.')};
$('#discard-session').onclick=()=>{restoring=false;currentId=null;preparedId=null;closeDialog($('#restore-dialog'));snapshot()};
document.addEventListener('visibilitychange',()=>{if(document.hidden)snapshot();else audioContextSafeResume()});window.addEventListener('pagehide',snapshot);window.addEventListener('pageshow',e=>{if(e.persisted)render()});
let batteryWarned=false;
async function batteryStatus(){if(!navigator.getBattery)return;try{const b=await navigator.getBattery();const update=()=>{const n=Math.round(b.level*100);$('#battery').textContent='🔋 '+n+'%';if(n<=20&&!b.charging&&!batteryWarned){batteryWarned=true;toast('Bateria baixa: '+n+'%',true)}if(n>25)batteryWarned=false};update();b.addEventListener('levelchange',update);b.addEventListener('chargingchange',update)}catch{}}
function render(){renderPads();renderHistory();renderSongs();$$('.lib-name').forEach(x=>x.textContent=title(state.lib));$('#now-note').textContent=pad?pad.note:'—';$('#now-status').textContent=pad?(context?.state==='running'&&!pad.audio.paused?'● Pad tocando':'Áudio suspenso • toque para retomar'):loadingNote?'Carregando…':'Nenhum pad ativo';$('#now-meta').textContent=pad?title(pad.lib)+' • '+pad.note:'Selecionado: '+state.note;$$('.stop-pad').forEach(x=>x.disabled=!pad&&!pendingPad&&!Array.from(tracks).some(t=>t.kind==='pad'));$$('.stop-all').forEach(x=>x.disabled=!tracks.size);$$('.metro-status').forEach(x=>x.textContent=metro?'Tocando':'Parado');$$('[data-action="toggle-metro"]').forEach(x=>{x.textContent=metro?'■ Parar metrônomo':'▶ Metrônomo';x.classList.toggle('danger',!!metro)});$$('.meter-label').forEach(x=>x.textContent=state.meter.replace('x','/'));$$('[data-meter]').forEach(x=>x.classList.toggle('active',x.dataset.meter===state.meter));$$('[data-bpm]').forEach(x=>x.classList.toggle('active',Number(x.dataset.bpm)===state.bpm));$('#player').classList.toggle('hidden',!pad&&!metro);$('#player-title').textContent=pad?title(pad.lib)+' • '+pad.note+(metro?' • '+state.bpm+' BPM':''):metro?'Metrônomo • '+state.bpm+' BPM':'';$('#prepared-name').textContent=getSong(preparedId)?.name||'Nenhuma';$('#current-song').textContent=getSong(currentId)?.name||'Nenhuma';const i=songs.findIndex(s=>s.id===currentId);$('#next-song').textContent=songs.length?songs[(i+1)%songs.length].name:'Nenhuma';installBanner()}
const actions={stage:openStage,'close-stage':closeStage,lock:()=>openDialog('#lock-dialog'),library:()=>{renderLibraries();$('#library-search').value='';openDialog('#library-dialog')},add:()=>openEditor(),copy:openCopy,'prepare-next':prepareNext,'play-prepared':playPrepared,'stage-next':stageNext,both,'stop-pad':stopPad,'stop-all':stopAll,'toggle-metro':toggleMetro,tap:tapTempo,'clear-history':()=>{state.hist=[];save();renderHistory()},help:()=>{$('#help-never').checked=false;showHelp()},'close-help':closeHelp,install:installApp,offline:offlineStatus,'dismiss-install':()=>{state.installDismissed=true;save();installBanner()}};
document.addEventListener('click',e=>{const t=e.target;if(!(t instanceof Element))return;const close=t.closest('[data-close]');if(close){e.preventDefault();closeDialog(close.closest('dialog'));return}const a=t.closest('[data-action]');if(a){e.preventDefault();actions[a.dataset.action]?.();return}const tab=t.closest('[data-tab]');if(tab){showTab(tab.dataset.tab);return}const favorite=t.closest('[data-favorite]');if(favorite){const n=favorite.dataset.favorite;state.fav=state.fav.includes(n)?state.fav.filter(x=>x!==n):[...state.fav,n];save();renderPads();return}const note=t.closest('[data-note]');if(note){togglePad(note.dataset.note);return}const fade=t.closest('[data-fade-key]');if(fade){state[fade.dataset.fadeKey]=Number(fade.dataset.seconds);save();renderFades();return}const bpm=t.closest('[data-bpm]');if(bpm){setBPM(bpm.dataset.bpm);return}const step=t.closest('[data-step]');if(step){setBPM(state.bpm+Number(step.dataset.step));return}const meter=t.closest('[data-meter]');if(meter){setMeter(meter.dataset.meter);return}const lib=t.closest('[data-library]');if(lib){state.lib=lib.dataset.library;save();closeDialog($('#library-dialog'));render();return}const favLib=t.closest('[data-fav-lib]');if(favLib){const l=favLib.dataset.favLib;state.favLibs=state.favLibs.includes(l)?state.favLibs.filter(x=>x!==l):[...state.favLibs,l];save();renderLibraries($('#library-search').value);return}const hist=t.closest('[data-history]');if(hist){const [lib,note]=hist.dataset.history.split('|');startPad(note,{lib});return}const deletion=t.closest('[data-delete]');if(deletion){e.preventDefault();requestDelete(deletion.dataset.delete);return}const edit=t.closest('[data-edit]');if(edit){openEditor(edit.dataset.edit);return}const move=t.closest('[data-move]');if(move){moveSong(move.dataset.id,Number(move.dataset.move));return}const song=t.closest('[data-song]');if(song){if(suppressSongClick===song.dataset.song){suppressSongClick=null;return}runSong(song.dataset.song)}});
document.addEventListener('keydown',e=>{if(e.target.matches('[data-favorite]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click()}});
document.addEventListener('input',e=>{if(e.target.matches('.bpm-range'))setBPM(e.target.value,e.target)});document.addEventListener('change',e=>{if(e.target.matches('.bpm-input'))setBPM(e.target.value,e.target)});
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&d.id!=='lock-dialog'){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){if(d.id==='help-dialog')closeHelp();else closeDialog(d)}}}));
function init(){restoring=!!previousSession;$('#metro').innerHTML=metroHTML();$('#stage-metro').innerHTML=metroHTML(true);settingsUI();renderFades();showTab(state.tab);render();saveSongs();batteryStatus();if(previousSession)restoring=true;if(!state.tourDone)showHelp();else if(previousSession)offerRestore();if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});if('mediaSession'in navigator){try{navigator.mediaSession.setActionHandler('stop',stopAll);navigator.mediaSession.setActionHandler('pause',stopAll)}catch{}}}
init();
