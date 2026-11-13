// Contract tests for the JSX state machine. These do not replace Premiere testing.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cep/host.jsx'),'utf8'),T=254016000000,F=T/30;
const fixture=require('./host-fixture');
const row=(path,start,end)=>({path,kind:/mp4$/.test(path)?'video':'image',sceneIndex:1,startFrame:start,endFrame:end,sourceStartFrame:0});
test('image + video + voice, delayed DOM, exact frame timing, original untouched',()=>{
  const f=fixture({delayImport:true,delayInsertion:true}),b=f.begin();assert.equal(b.ok,true);
  assert.equal(f.step(b.token,0,row('C:/001.png',0,45)).ok,true);
  assert.equal(f.step(b.token,1,row('C:/002.mp4',45,90)).ok,true);
  const result=f.step(b.token,2,null);assert.equal(result.complete,true);
  const s=f.project.activeSequence;assert.equal(s.videoTracks[0].clips.length,2);assert.equal(s.audioTracks[0].clips.length,1);
  assert.equal(s.audioTracks[0].clips[0].projectItem.getMediaPath(),'C:/voice.wav');
  assert.equal(s.videoTracks[0].clips[0].end.ticks,s.videoTracks[0].clips[1].start.ticks);
  assert.equal(Number(s.videoTracks[0].clips[1].end.ticks),90*F);
  assert.equal(f.original.videoTracks[0].clips.length,0);assert.equal(f.original.audioTracks[0].clips.length,0);assert.equal(f.insertions,3);
});
test('replayed completed step does not duplicate',()=>{
  const f=fixture(),b=f.begin(),r=row('C:/001.png',0,45);assert.equal(f.step(b.token,0,r).ok,true);
  assert.equal(f.call('asvStep',b.token,0,r).ok,true);assert.equal(f.insertions,1);
});
test('switching sequences stops before inserting anything',()=>{
  const f=fixture(),b=f.begin();f.project.activeSequence=f.original;
  assert.equal(f.step(b.token,0,row('C:/001.png',0,45)).ok,false);assert.equal(f.insertions,0);
});
test('timeline edits between steps are detected',()=>{
  const f=fixture(),b=f.begin();f.step(b.token,0,row('C:/001.png',0,45));
  f.project.activeSequence.videoTracks[0].clips[0].disabled=true;
  assert.equal(f.step(b.token,1,row('C:/002.png',45,90)).ok,false);assert.equal(f.insertions,1);
});
test('failed trim is not reported as success',()=>{
  const f=fixture({refuseTrim:true}),b=f.begin();const result=f.step(b.token,0,row('C:/001.png',0,45));
  assert.equal(result.ok,false);assert.match(result.error,/thời lượng/);assert.equal(f.insertions,1);
});
test('gap in incoming plan is rejected',()=>{
  const f=fixture(),b=f.begin();assert.equal(f.step(b.token,0,row('C:/001.png',1,45)).ok,false);assert.equal(f.insertions,0);
});
test('stopping keeps partial sequence but permits a new run',()=>{
  const f=fixture(),b=f.begin();f.step(b.token,0,row('C:/001.png',0,45));
  assert.equal(f.begin().ok,false);assert.equal(f.call('asvStop',b.token).ok,true);
  assert.equal(f.project.activeSequence.videoTracks[0].clips.length,1);assert.equal(f.begin().ok,true);
});
test('pending import retry never imports twice',()=>{
  const f=fixture({delayImport:true}),b=f.begin();f.step(b.token,0,row('C:/001.png',0,45));assert.equal(f.imports,1);
});
test('audio added by user during insertion is not deleted',()=>{
  const f=fixture(),b=f.begin(),r=row('C:/001.mp4',0,45);
  f.call('asvStep',b.token,0,r);f.call('asvStep',b.token,0,r);
  const a=f.project.activeSequence.audioTracks[0];
  a.overwriteClip({nodeId:'user-audio',getMediaPath(){return 'C:/user.wav';}},0);
  const result=f.call('asvStep',b.token,0,r);assert.equal(result.ok,false);
  assert.ok(a.clips.some(c=>c.projectItem.nodeId==='user-audio'));
});
function prepareCaption(options={}){
  const f=fixture(options);f.meta.captionPath='C:/Tiếng Việt 日本.srt';
  const b=f.begin();return {f,b};
}
function placeMedia(f,b){
  assert.equal(f.step(b.token,0,row('C:/001.png',0,45)).ok,true);
  assert.equal(f.step(b.token,1,row('C:/002.mp4',45,90)).ok,true);
  const voice=f.step(b.token,2,null);assert.equal(voice.ok,true);assert.equal(voice.complete,false);
}
test('one native caption track after voice, no V2 required, delayed import and final replay safe',()=>{
  const {f,b}=prepareCaption({delayImport:true,delayInsertion:true});
  assert.equal(b.ok,true);assert.equal(b.total,4);placeMedia(f,b);
  const result=f.step(b.token,3,null);assert.equal(result.complete,true);assert.equal(result.done,4);
  assert.equal(f.captionCalls.length,1);assert.equal(f.captionCalls[0].offset,0);
  assert.equal(f.captionCalls[0].item.getMediaPath(),f.meta.captionPath);assert.equal(f.captionCalls[0].voiceCount,1);
  assert.equal(f.project.activeSequence.videoTracks.length,1);assert.equal(f.insertions,3);assert.equal(f.imports,4);
  assert.equal(f.original.videoTracks[0].clips.length,0);
  assert.equal(f.call('asvStep',b.token,3,null).ok,true);assert.equal(f.captionCalls.length,1);
});
test('native captions do not add video overlays on a sequence with V2',()=>{
  const {f,b}=prepareCaption({videoTracks:2});placeMedia(f,b);f.step(b.token,3,null);
  assert.equal(f.project.activeSequence.videoTracks[1].clips.length,0);
});
test('missing caption API fails before media import with usable SRT guidance',()=>{
  const {f,b}=prepareCaption({noCaptionAPI:true});assert.equal(b.ok,false);
  assert.match(b.error,/không hỗ trợ/);assert.ok(b.error.includes(f.meta.captionPath));assert.equal(f.imports,0);
});
test('missing caption API does not block a build with captions disabled',()=>{
  const f=fixture({noCaptionAPI:true});assert.equal(f.begin().ok,true);
});
for(const options of [{captionResult:false},{captionResult:null},{captionThrows:true}]){
  test('caption API failure never reports success or retries: '+JSON.stringify(options),()=>{
    const {f,b}=prepareCaption(options);placeMedia(f,b);
    assert.equal(f.step(b.token,3,null).ok,false);assert.equal(f.captionCalls.length,1);
    assert.equal(f.call('asvStep',b.token,3,null).ok,false);assert.equal(f.captionCalls.length,1);
    assert.equal(f.project.activeSequence.audioTracks[0].clips.length,1);
  });
}
test('SRT import failure retains completed picture and voice and skips caption API',()=>{
  const {f,b}=prepareCaption({refuseSrtImport:true});placeMedia(f,b);
  assert.equal(f.step(b.token,3,null).ok,false);assert.equal(f.captionCalls.length,0);
  assert.equal(f.project.activeSequence.videoTracks[0].clips.length,2);
});
test('new SRT item with no media path is resolved by identity and filename',()=>{
  const {f,b}=prepareCaption({emptySrtPath:true,delayImport:true});placeMedia(f,b);
  assert.equal(f.step(b.token,3,null).complete,true);assert.equal(f.captionCalls.length,1);
});
test('timeline edit while SRT import is pending stops before caption creation',()=>{
  const {f,b}=prepareCaption();placeMedia(f,b);assert.equal(f.call('asvStep',b.token,3,null).pending,true);
  f.project.activeSequence.audioTracks[0].clips[0].disabled=true;
  assert.equal(f.call('asvStep',b.token,3,null).ok,false);assert.equal(f.captionCalls.length,0);
});
test('stop during SRT import cannot create a caption track on replay',()=>{
  const {f,b}=prepareCaption();placeMedia(f,b);f.call('asvStep',b.token,3,null);f.call('asvStop',b.token);
  assert.equal(f.call('asvStep',b.token,3,null).ok,false);assert.equal(f.captionCalls.length,0);
});
test('caption creation cannot skip narration',()=>{
  const {f,b}=prepareCaption();f.step(b.token,0,row('C:/001.png',0,45));f.step(b.token,1,row('C:/002.png',45,90));
  assert.equal(f.call('asvStep',b.token,3,null).ok,false);assert.equal(f.captionCalls.length,0);
});
test('missing SRT fails before a new sequence is created',()=>{
  const f=fixture();f.meta.captionPath='C:/missing.srt';assert.equal(f.begin().ok,false);assert.equal(f.project.sequences.length,1);
});
