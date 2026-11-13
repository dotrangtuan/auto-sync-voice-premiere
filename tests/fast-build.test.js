'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./host-fixture');
const F=254016000000/30;
const row=(path,start,end)=>({path,kind:/mp4$/.test(path)?'video':'image',sceneIndex:1,startFrame:start,endFrame:end,motion:'none'});
function finish(f,b){
  assert.equal(f.step(b.token,0,row('C:/001.png',0,45)).ok,true);
  assert.equal(f.step(b.token,1,row('C:/002.mp4',45,90)).ok,true);
  return f.step(b.token,2,null);
}
test('immediate image completes in one bridge call; replay does not insert twice',()=>{
  const f=fixture({fast:true}),b=f.begin(),r=row('C:/001.png',0,45);
  const before=f.metrics.calls,result=f.call('asvAdvance',b.token,0,r);
  assert.equal(result.ok,true);assert.equal(result.pending,false);assert.equal(result.done,1);
  assert.equal(f.metrics.calls-before,1);assert.equal(f.insertions,1);
  assert.equal(f.call('asvAdvance',b.token,0,r).done,1);assert.equal(f.insertions,1);
});
for(const delay of [{delayImport:true},{delayInsertion:true},{delayImport:true,delayInsertion:true}]){
  test('delayed host yields, imports/inserts once and keeps timing: '+JSON.stringify(delay),()=>{
    const f=fixture({...delay,fast:true}),b=f.begin();
    assert.equal(finish(f,b).complete,true);assert.equal(f.insertions,3);assert.equal(f.imports,3);
    const seq=f.project.activeSequence;
    assert.equal(seq.videoTracks[0].clips.length,2);assert.equal(seq.audioTracks[0].clips.length,1);
    assert.equal(seq.videoTracks[0].clips[0].end.ticks,seq.videoTracks[0].clips[1].start.ticks);
    assert.equal(Number(seq.videoTracks[0].clips[1].end.ticks),90*F);
  });
}
test('quick build preserves complete timeline edit detection and project/sequence guards',()=>{
  for(const change of ['disabled','start','end','inPoint','outPoint','lock','sequence','project']){
    const f=fixture({fast:true}),b=f.begin();assert.equal(f.step(b.token,0,row('C:/001.png',0,45)).ok,true);
    const track=f.project.activeSequence.videoTracks[0],clip=track.clips[0];
    if(change==='disabled')clip.disabled=true;
    else if(change==='lock')track.locked=true;
    else if(change==='sequence')f.project.activeSequence=f.original;
    else if(change==='project')f.project.path='C:/other.prproj';
    else clip[change].ticks=String(Number(clip[change].ticks)+F);
    assert.equal(f.step(b.token,1,row('C:/002.png',45,90)).ok,false,change);
    assert.equal(f.insertions,1,change);
  }
});
test('fast build notices edits while import is pending without inserting',()=>{
  const f=fixture({fast:true,delayImport:true}),b=f.begin();
  f.step(b.token,0,row('C:/001.png',0,45));
  assert.equal(f.call('asvAdvance',b.token,1,row('C:/002.png',45,90)).pending,true);
  f.project.activeSequence.videoTracks[0].clips[0].disabled=true;
  assert.equal(f.call('asvAdvance',b.token,1,row('C:/002.png',45,90)).ok,false);assert.equal(f.insertions,1);
});
test('stop during delayed insertion prevents continuation and keeps partial sequence',()=>{
  const f=fixture({fast:true,delayInsertion:true}),b=f.begin(),r=row('C:/001.png',0,45);
  assert.equal(f.call('asvAdvance',b.token,0,r).pending,true);
  f.call('asvStop',b.token);
  assert.equal(f.call('asvAdvance',b.token,0,r).ok,false);assert.equal(f.insertions,1);
  assert.equal(f.begin().ok,true);
});
test('failed trim and changed pending rows never cause duplicate inserts',()=>{
  const f=fixture({fast:true,refuseTrim:true}),b=f.begin();
  assert.equal(f.step(b.token,0,row('C:/001.png',0,45)).ok,false);assert.equal(f.insertions,1);
  const g=fixture({fast:true,delayImport:true}),c=g.begin();
  assert.equal(g.call('asvAdvance',c.token,0,row('C:/001.png',0,45)).pending,true);
  assert.equal(g.call('asvAdvance',c.token,0,row('C:/002.png',0,45)).ok,false);assert.equal(g.imports,1);assert.equal(g.insertions,0);
});
test('captions stay after narration; final replay does not create a second track',()=>{
  const f=fixture({fast:true,delayImport:true,emptySrtPath:true});f.meta.captionPath='C:/日本.srt';const b=f.begin();
  assert.equal(finish(f,b).complete,false);
  assert.equal(f.step(b.token,3,null).complete,true);assert.equal(f.captionCalls.length,1);assert.equal(f.captionCalls[0].voiceCount,1);
  assert.equal(f.call('asvAdvance',b.token,3,null).complete,true);assert.equal(f.captionCalls.length,1);
});
for(const option of [{captionResult:false},{captionResult:null},{captionThrows:true},{refuseSrtImport:true}]){
  test('fast caption errors cannot retry creation or claim success: '+JSON.stringify(option),()=>{
    const f=fixture({...option,fast:true});f.meta.captionPath='C:/captions.srt';const b=f.begin();finish(f,b);
    assert.equal(f.step(b.token,3,null).ok,false);assert.equal(f.call('asvAdvance',b.token,3,null).ok,false);
    assert.equal(f.captionCalls.length,option.refuseSrtImport?0:1);
  });
}
test('captured full snapshot is identical to a fresh scan and skips only the requested clip',()=>{
  const f=fixture({fast:true}),b=f.begin();finish(f,b);
  const seq=f.project.activeSequence,st=f.context.$.global.asvState,capture={};
  const omitted=f.context.asvSnapshot(seq,seq.videoTracks[0].clips[0],capture);
  assert.equal(capture.snapshot,f.context.asvSnapshot(seq));assert.equal(st.snapshot,capture.snapshot);
  assert.equal(JSON.parse(omitted)[2][1].length,1);assert.equal(JSON.parse(capture.snapshot)[2][1].length,2);
});
