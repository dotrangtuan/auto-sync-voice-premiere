// Integration: actual panel + actual JSX state machine; Adobe/Python simulated.
const {JSDOM}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const install=require('./cep-fixture'),hostFixture=require('./host-fixture'),root=path.resolve(__dirname,'../cep');
function waitFor(fn){return new Promise((resolve,reject)=>{const start=Date.now(),t=setInterval(()=>{if(fn()){clearInterval(t);resolve();}else if(Date.now()-start>6000){clearInterval(t);reject(Error('timeout'));}},5);});}
function setup(opts={}){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'}),w=dom.window,f=hostFixture(opts);
  w.eval('('+install.toString()+')()');
  w.__adobe_cep__.evalScript=(script,cb)=>{w.__asvTest.calls.push(script);const [,method,args]=script.match(/^(\w+)\((.*)\)$/s);const result=f.call(method,...JSON.parse('['+args+']'));w.setTimeout(()=>cb(JSON.stringify(result)),10);};
  if(opts.stored)w.localStorage.setItem('autoSyncVoice.v3',JSON.stringify(opts.stored));
  w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  return {w,f,$:id=>w.document.getElementById(id),close:()=>w.close()};
}
async function analyze(t){const {$}=t;$('audio').value='C:/voice.wav';$('mediaDir').value='C:/images';$('transcriptText').value='朝。電話。安心。';$('analyze').click();await waitFor(()=>$('scenes').children.length===3 && !$('analyze').disabled);$('accept').checked=true;$('accept').dispatchEvent(new t.w.Event('change'));}
test('default batch route builds exact visuals, narration, captions and saves profile with delayed host',async()=>{
  const t=setup({delayImport:true,delayInsertion:true});const {w,f,$}=t;
  assert.equal($('buildMode').value,'turbo');await analyze(t);$('build').click();
  await waitFor(()=>$('status').textContent.startsWith('Đã tạo') && !$('analyze').disabled);
  assert.ok(w.__asvTest.calls.some(s=>s.startsWith('asvPrepare')));assert.ok(w.__asvTest.calls.some(s=>s.startsWith('asvBatch')));
  assert.equal(f.project.activeSequence.videoTracks[0].clips.length,3);assert.equal(f.project.activeSequence.audioTracks[0].clips.length,1);assert.equal(f.captionCalls.length,1);
  assert.equal(f.importedPaths[0].length,3);assert.equal(f.imports,3);
  assert.equal(w.__asvTest.profiles.length,1);assert.equal(w.__asvTest.profiles[0].mode,'turbo');assert.equal(w.__asvTest.profiles[0].completed,true);assert.equal(w.__asvTest.profiles[0].stats.importCalls,3);
  assert.ok($('log').textContent.includes('Chi phí API'));t.close();
});
test('batch import failure does not silently switch modes or report completion',async()=>{
  const t=setup({refuseBulk:true});await analyze(t);t.$('build').click();await waitFor(()=>t.w.__asvTest.calls.some(s=>s.startsWith('asvStop')) && !t.$('analyze').disabled);
  assert.equal(t.f.insertions,0);assert.equal(t.f.imports,1);assert.ok(!t.$('log').textContent.includes('Hoàn tất'));
  assert.equal(t.w.__asvTest.profiles[0].completed,false);assert.ok(!t.w.__asvTest.calls.some(s=>s.startsWith('asvAdvance')));t.close();
});
test('Stop during bulk import submits no visual batch',async()=>{
  const t=setup({delayImport:true});await analyze(t);t.$('build').click();await waitFor(()=>t.w.__asvTest.calls.some(s=>s.startsWith('asvPrepare')));t.$('stop').click();
  await waitFor(()=>!t.$('analyze').disabled);assert.equal(t.f.insertions,0);assert.ok(!t.w.__asvTest.calls.some(s=>s.startsWith('asvBatch')));assert.equal(t.w.__asvTest.profiles[0].completed,false);t.close();
});
test('batch caption failure leaves visuals and narration, never claims completion',async()=>{
  const t=setup({captionResult:false});await analyze(t);t.$('build').click();await waitFor(()=>t.w.__asvTest.calls.some(s=>s.startsWith('asvStop')) && !t.$('analyze').disabled);
  assert.equal(t.f.project.activeSequence.videoTracks[0].clips.length,3);assert.equal(t.f.captionCalls.length,1);assert.equal(t.w.__asvTest.profiles[0].completed,false);t.close();
});
test('saved 0.3.1 compatibility choice migrates; invalid mode falls back to turbo',()=>{
  for(const [stored,expected]of [[{fastBuild:false},'safe'],[{fastBuild:true},'turbo'],[{buildMode:'bad'},'turbo']]){const t=setup({stored});assert.equal(t.$('buildMode').value,expected);t.close();}
});
