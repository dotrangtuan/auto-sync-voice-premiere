'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./host-fixture');
const F=254016000000/30;
const row=(i,path)=>({path:path||'C:/日本/'+(i+1)+'.png',kind:path && /mp4$/.test(path)?'video':'image',sceneIndex:i+1,startFrame:i*30,endFrame:(i+1)*30,motion:'none'});
function setup(count=8,opts={}){const f=fixture(opts);Object.assign(f.meta,{turbo:true,clipCount:count,duration:count,totalFrames:count*30});return {f,b:f.begin(),rows:Array.from({length:count},(_,i)=>row(i))};}
function poll(f,method,...args){for(let i=0;i<100;i++){const r=f.call(method,...args);if(!r.ok || !r.pending)return r;}throw Error('poll timeout');}
function prep(f,b,rows){const r=poll(f,'asvPrepare',b.token,rows.map(r=>r.path));assert.equal(r.ok,true,r.error);return r;}
function batch(f,b,start,rows){const r=poll(f,'asvBatch',b.token,start,rows);assert.equal(r.ok,true,r.error);return r;}
function pictures(f,b,rows){for(let start=0;start<rows.length;start+=32){const chunk=rows.slice(start,start+32);prep(f,b,chunk);for(let i=0;i<chunk.length;i+=8)batch(f,b,start+i,chunk.slice(i,i+8));}}
test('eight images use one import and one processing call; exact final sequence and replay',()=>{
  const {f,b,rows}=setup();prep(f,b,rows);const before=f.metrics.calls;
  const r=f.call('asvBatch',b.token,0,rows);assert.equal(r.ok,true,r.error);assert.equal(r.done,8);assert.equal(r.pending,false);
  assert.equal(f.metrics.calls-before,1);assert.equal(f.imports,1);assert.equal(f.insertions,8);
  assert.equal(f.call('asvBatch',b.token,0,rows).done,8);assert.equal(f.insertions,8);
  assert.equal(batch(f,b,8,[null]).complete,true);
  const seq=f.project.activeSequence;assert.equal(seq.videoTracks[0].clips.length,8);assert.equal(seq.audioTracks[0].clips.length,1);
  seq.videoTracks[0].clips.forEach((c,i)=>{assert.equal(Number(c.start.ticks),i*30*F);assert.equal(Number(c.end.ticks),(i+1)*30*F);assert.equal(Number(c.inPoint.ticks),0);});
  assert.equal(f.original.videoTracks[0].clips.length,0);
});
for(const opts of [{delayImport:true},{delayInsertion:true},{delayImport:true,delayInsertion:true},{reverseBin:true}])test('batch handles delayed/reordered DOM without duplicates: '+JSON.stringify(opts),()=>{
  const {f,b,rows}=setup(10,opts);rows[2]=row(2,'C:/three.mp4');pictures(f,b,rows);assert.equal(batch(f,b,10,[null]).complete,true);
  assert.equal(f.imports,2);assert.equal(f.insertions,11);assert.equal(f.project.activeSequence.audioTracks[0].clips.length,1);
});
test('preload deduplicates repeated shots and caches fitted media',()=>{
  const {f,b,rows}=setup(16);rows.forEach(r=>r.path='C:/same.png');prep(f,b,rows);
  assert.equal(f.importedPaths[0].length,1);batch(f,b,0,rows.slice(0,8));prep(f,b,rows.slice(8));batch(f,b,8,rows.slice(8));
  assert.equal(f.imports,1);assert.equal(f.project.activeSequence.videoTracks[0].clips[0].projectItem.fit,true);
});
test('partial bulk import times out without resubmission or timeline insertion',()=>{
  const {f,b,rows}=setup(4,{partialImport:true});const paths=rows.map(r=>r.path);
  assert.equal(f.call('asvPrepare',b.token,paths).pending,true);
  f.context.$.global.asvState.preload.started=Date.now()-120001;
  assert.equal(f.call('asvPrepare',b.token,paths).ok,false);assert.equal(f.imports,1);assert.equal(f.insertions,0);
  assert.equal(f.call('asvPrepare',b.token,paths).ok,false);assert.equal(f.imports,1);
});
test('rejected bulk import fails closed without per-file fallback',()=>{
  const {f,b,rows}=setup(3,{refuseBulk:true});assert.equal(f.call('asvPrepare',b.token,rows.map(r=>r.path)).ok,false);
  assert.equal(f.imports,1);assert.equal(f.insertions,0);
});
test('changed preload request is rejected rather than importing a second group',()=>{
  const {f,b,rows}=setup(3,{delayImport:true});assert.equal(f.call('asvPrepare',b.token,rows.map(r=>r.path)).pending,true);
  assert.equal(f.call('asvPrepare',b.token,['C:/other.png']).ok,false);assert.equal(f.imports,1);
});
test('changed batch while a clip is pending is rejected without duplicate insert',()=>{
  const {f,b,rows}=setup(8,{delayInsertion:true});prep(f,b,rows);
  assert.equal(f.call('asvBatch',b.token,0,rows).pending,true);
  const changed=JSON.parse(JSON.stringify(rows));changed[1].endFrame++;
  assert.equal(f.call('asvBatch',b.token,0,changed).ok,false);assert.equal(f.insertions,1);
});
test('Stop during bulk import or insertion prevents future clip submissions',()=>{
  for(const opts of [{delayImport:true},{delayInsertion:true}]){
    const {f,b,rows}=setup(8,opts);
    if(opts.delayImport)f.call('asvPrepare',b.token,rows.map(r=>r.path));else{prep(f,b,rows);f.call('asvBatch',b.token,0,rows);}
    const count=f.insertions;f.call('asvStop',b.token);assert.equal(f.call('asvBatch',b.token,0,rows).ok,false);assert.equal(f.insertions,count);
    assert.equal(f.begin().ok,true);
  }
});
test('project, sequence, track locks/counts, first/tail edits stop before next insertion',()=>{
  for(const kind of ['project','sequence','lock','extraTrack','first','tail','count']){
    const {f,b,rows}=setup(16);prep(f,b,rows);batch(f,b,0,rows.slice(0,8));const seq=f.project.activeSequence,tr=seq.videoTracks[0];
    if(kind==='project')f.project.path='C:/other.prproj';else if(kind==='sequence')f.project.activeSequence=f.original;
    else if(kind==='lock')tr.locked=true;else if(kind==='extraTrack')seq.videoTracks.push(tr);
    else if(kind==='first')tr.clips[0].disabled=true;else if(kind==='tail')tr.clips[7].end.ticks=String(400*F);
    else tr.clips.pop();
    assert.equal(f.call('asvBatch',b.token,8,rows.slice(8)).ok,false,kind);assert.equal(f.insertions,8,kind);
  }
});
test('interior edits are detected by full checkpoint audit',()=>{
  const {f,b,rows}=setup(40);pictures(f,b,rows.slice(0,32));f.project.activeSequence.videoTracks[0].clips[12].disabled=true;
  assert.equal(f.call('asvPrepare',b.token,rows.slice(32).map(r=>r.path)).ok,false);assert.equal(f.insertions,32);
});
test('interior edit before narration is detected even below first checkpoint',()=>{
  const {f,b,rows}=setup(16);pictures(f,b,rows);f.project.activeSequence.videoTracks[0].clips[7].disabled=true;
  assert.equal(f.call('asvBatch',b.token,16,[null]).ok,false);assert.equal(f.project.activeSequence.audioTracks[0].clips.length,0);
});
test('interior edits during narration insertion fail final audit before captions',()=>{
  const f=fixture({delayInsertion:true});Object.assign(f.meta,{turbo:true,clipCount:16,duration:16,totalFrames:480,captionPath:'C:/sub.srt'});
  const active=f.begin(),rows=Array.from({length:16},(_,i)=>row(i));pictures(f,active,rows);
  assert.equal(f.call('asvBatch',active.token,16,[null]).pending,true);
  f.project.activeSequence.videoTracks[0].clips[7].disabled=true;
  assert.equal(poll(f,'asvBatch',active.token,16,[null]).ok,false);assert.equal(f.captionCalls.length,0);
});
test('native captions run once after narration and reject uncertain success',()=>{
  for(const opts of [{},{captionResult:false},{captionResult:null},{captionThrows:true},{emptySrtPath:true,delayImport:true}]){
    const f=fixture(opts);Object.assign(f.meta,{turbo:true,clipCount:2,duration:2,totalFrames:60,captionPath:'C:/日本.srt'});const b=f.begin(),rows=[row(0),row(1)];pictures(f,b,rows);
    assert.equal(batch(f,b,2,[null]).complete,false);const r=poll(f,'asvBatch',b.token,3,[null]);
    const success=!('captionResult' in opts) && !opts.captionThrows;assert.equal(r.ok,success);
    assert.equal(f.captionCalls.length,1);assert.equal(f.captionCalls[0].voiceCount,1);
    assert.equal(f.call('asvBatch',b.token,3,[null]).ok,success);assert.equal(f.captionCalls.length,1);
  }
});
test('validation work scales linearly on 128 and 512 images',()=>{
  function run(n){const {f,b,rows}=setup(n);pictures(f,b,rows);assert.equal(batch(f,b,n,[null]).complete,true);return f.context.$.global.asvState.stats;}
  const small=run(128),large=run(512);
  assert.ok(large.clipReads<small.clipReads*4.3,JSON.stringify({small,large}));assert.ok(large.clipReads<15000);assert.ok(large.fullAudits<12);
  assert.equal(large.importCalls,17);
});
