/* Kivo: offline key-value practice. No external dependencies. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const els = Object.fromEntries(['setup','practice','completion','csv-file','file-status','direction','mode','collect-mistakes','start-button','progress-hint','export-progress','progress-file','reset-progress','storage-note','leave-button','list-label','remaining-count','correct-count','mistake-count','prompt','answer-form','answer','check-button','feedback','feedback-title','feedback-answer','lookup-answer','restart-button','setup-button','final-correct','final-mistakes','mistake-actions','export-mistakes','clear-mistakes'].map(id=>[id.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),$(id)]));
  const STORAGE_KEY='kivo.progress.v1', MISTAKES_KEY='kivo.mistakes.v1';
  let pairs=[], fileName='', fingerprint='', queue=[], current=null, evaluated=false, correct=0, sessionMistakes=0, collected=new Map(), storageWorks=true;
  const normalize = s => String(s).normalize('NFC').replace(/[’‘ʼ＇`´]/g,"'").replace(/\s+/gu,' ').trim().toLowerCase();
  const stripMarks = s => s.normalize('NFD').replace(/\p{M}/gu,'');
  function compareAnswers(a,b){const x=normalize(a),y=normalize(b);if(x===y)return 'correct';if(stripMarks(x)===stripMarks(y))return 'near';return 'wrong';}
  function parseCSV(text){
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}else if(c==='"'){if(field.length)throw Error('Unexpected quote in an unquoted field.');quoted=true;}else if(c===','){row.push(field);field='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}
    if(quoted)throw Error('A quoted field was not closed.');if(field.length||row.length){row.push(field);rows.push(row);}
    while(rows.length&&rows[0].every(v=>!v.trim()))rows.shift();if(!rows.length)throw Error('The CSV is empty.');
    const headers=rows.shift().map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase());const ki=headers.indexOf('key'),vi=headers.indexOf('value');if(ki<0||vi<0||ki===vi)throw Error('The first row must include separate “key” and “value” headers.');
    const found=[],seen=new Set();for(const r of rows){if(r.every(v=>!v.trim()))continue;if(ki>=r.length||vi>=r.length)throw Error('A row is missing a key or value.');const key=r[ki],value=r[vi];if(!key.trim()||!value.trim())throw Error('Every non-empty row must have both a key and a value.');const id=JSON.stringify([key,value]);if(!seen.has(id)){found.push({key,value});seen.add(id);}}
    return found;
  }
  function hash(text){let h1=0xdeadbeef^text.length,h2=0x41c6ce57^text.length;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');}
  function shuffled(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function loadJSON(key,fallback){try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback;}catch{storageWorks=false;return fallback;}}
  function saveProgress(){if(!fingerprint)return;try{const all=loadJSON(STORAGE_KEY,{});all[fingerprint]={fileName,direction:els.direction.value,remaining:queue.map(x=>x.index)};localStorage.setItem(STORAGE_KEY,JSON.stringify(all));}catch{storageWorks=false;}els.storageNote.hidden=storageWorks;updateProgressHint();}
  function updateProgressHint(){if(!pairs.length){els.progressHint.textContent='';els.resetProgress.disabled=true;return;}const saved=loadJSON(STORAGE_KEY,{});const item=saved[fingerprint];els.progressHint.textContent=item?`${item.remaining.length} pair${item.remaining.length===1?'':'s'} saved for this list and direction.`:'No saved progressive exercise for this list and direction.';els.resetProgress.disabled=!item;}
  function directionFor(){return els.direction.value==='mixed'?(Math.random()<.5?'key-value':'value-key'):els.direction.value;}
  function show(name){els.setup.hidden=name!=='setup';els.practice.hidden=name!=='practice';els.completion.hidden=name!=='completion';}
  function renderQuestion(){
    if(!queue.length){finish();return;}current=queue[0];current.direction=directionFor();evaluated=false;els.feedback.hidden=true;els.lookupAnswer.hidden=true;els.answer.value='';els.answer.disabled=false;els.checkButton.textContent='Check ↵';
    const source=current.direction==='key-value'?current.pair.key:current.pair.value;els.prompt.textContent=source;els.remainingCount.textContent=queue.length;els.correctCount.textContent=correct;els.mistakeCount.textContent=sessionMistakes;requestAnimationFrame(()=>els.answer.focus());
  }
  function recordMistake(pair){if(!els.collectMistakes.checked)return;const id=JSON.stringify([pair.key,pair.value]);if(!collected.has(id)){collected.set(id,pair);try{localStorage.setItem(MISTAKES_KEY,JSON.stringify([...collected.values()]));}catch{storageWorks=false;}}}
  function checkAnswer(){if(evaluated)return;const expected=current.direction==='key-value'?current.pair.value:current.pair.key;const result=compareAnswers(els.answer.value,expected);evaluated=true;
    els.feedback.className='feedback '+result;els.feedback.hidden=false;els.feedbackTitle.textContent=(result==='correct'?'Correct':result==='near'?'Almost — check the accents':'Not quite')+' ↵';els.feedbackAnswer.textContent=expected;els.lookupAnswer.href='https://translate.google.com/?sl=auto&tl=en&text='+encodeURIComponent(expected)+'&op=translate';els.lookupAnswer.hidden=false;
    if(result==='correct'){queue.shift();correct++;saveProgress();}else{sessionMistakes++;recordMistake(current.pair);if(queue.length>1){queue.push(queue.shift());}saveProgress();}
    els.remainingCount.textContent=queue.length;els.correctCount.textContent=correct;els.mistakeCount.textContent=sessionMistakes;els.answer.disabled=true;els.checkButton.textContent=queue.length===0&&result==='correct'?'Finish ↵':'Continue ↵';els.checkButton.focus();
  }
  function advance(){if(queue.length===0){finish();return;}renderQuestion();}
  function finish(){saveProgress();els.finalCorrect.textContent=correct;els.finalMistakes.textContent=sessionMistakes;els.mistakeActions.hidden=!els.collectMistakes.checked||collected.size===0;show('completion');}
  function start(full=true){if(!pairs.length)return;const direction=els.direction.value;fingerprint=hash(JSON.stringify([pairs,direction]));const saved=loadJSON(STORAGE_KEY,{});let items;
    if(!full&&saved[fingerprint]?.remaining){const indexes=saved[fingerprint].remaining.filter(i=>Number.isInteger(i)&&pairs[i]);items=indexes.map(i=>({pair:pairs[i],index:i}));}else items=pairs.map((pair,index)=>({pair,index}));
    queue=shuffled(items);correct=0;sessionMistakes=0;collected=new Map(loadJSON(MISTAKES_KEY,[]).map(p=>[JSON.stringify([p.key,p.value]),p]));if(!queue.length){finish();return;}els.listLabel.textContent=`${fileName} · ${pairs.length} pairs`;show('practice');renderQuestion();
  }
  function download(filename,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function csvCell(value){return `"${String(value).replace(/"/g,'""')}"`;}
  els.csvFile.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const content=await f.text();pairs=parseCSV(content);fileName=f.name;fingerprint=hash(JSON.stringify([pairs,els.direction.value]));els.fileStatus.textContent=`${fileName} · ${pairs.length} pair${pairs.length===1?'':'s'} imported`;els.fileStatus.classList.remove('error');els.startButton.disabled=pairs.length===0;updateProgressHint();}catch(err){pairs=[];els.startButton.disabled=true;els.fileStatus.textContent=`Could not import CSV: ${err.message}`;els.fileStatus.classList.add('error');els.progressHint.textContent='';}});
  els.direction.addEventListener('change',()=>{if(pairs.length){fingerprint=hash(JSON.stringify([pairs,els.direction.value]));updateProgressHint();}});
  els.startButton.addEventListener('click',()=>start(els.mode.value==='full'));
  els.restartButton.addEventListener('click',()=>start(true));els.setupButton.addEventListener('click',()=>show('setup'));
  els.leaveButton.addEventListener('click',()=>{saveProgress();show('setup');updateProgressHint();});
  els.answerForm.addEventListener('submit',e=>{e.preventDefault();if(!evaluated)checkAnswer();else advance();});
  els.exportMistakes.addEventListener('click',()=>{const list=[...collected.values()];download('mistakes.csv','key,value\r\n'+list.map(p=>`${csvCell(p.key)},${csvCell(p.value)}`).join('\r\n'),'text/csv;charset=utf-8');});
  els.clearMistakes.addEventListener('click',()=>{collected.clear();try{localStorage.removeItem(MISTAKES_KEY);}catch{storageWorks=false;}els.finalMistakes.textContent='0';els.mistakeActions.hidden=true;});
  els.exportProgress.addEventListener('click',()=>download('kivo-progress.json',JSON.stringify({format:'kivo-progress-v1',progress:loadJSON(STORAGE_KEY,{})},null,2),'application/json'));
  els.resetProgress.addEventListener('click',()=>{if(!fingerprint)return;const all=loadJSON(STORAGE_KEY,{});delete all[fingerprint];try{localStorage.setItem(STORAGE_KEY,JSON.stringify(all));}catch{storageWorks=false;}updateProgressHint();});
  els.progressFile.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(data.format!=='kivo-progress-v1'||!data.progress||typeof data.progress!=='object')throw Error('This is not a Kivo progress export.');const old=loadJSON(STORAGE_KEY,{});localStorage.setItem(STORAGE_KEY,JSON.stringify({...old,...data.progress}));els.fileStatus.textContent='Progress imported. Choose its matching CSV and direction to continue.';if(pairs.length)updateProgressHint();}catch(err){els.fileStatus.textContent=`Could not import progress: ${err.message}`;}e.target.value='';});
  els.mode.addEventListener('change',()=>{if(pairs.length)updateProgressHint();});
  const storedMistakes=loadJSON(MISTAKES_KEY,[]);if(Array.isArray(storedMistakes))collected=new Map(storedMistakes.map(p=>[JSON.stringify([p.key,p.value]),p]));els.storageNote.hidden=storageWorks;
  // Expose pure helpers for optional lightweight browser-console checks.
  window.Kivo={parseCSV,compareAnswers,normalize,hash,shuffled};
})();
