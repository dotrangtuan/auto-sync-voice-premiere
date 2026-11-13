// npm install --no-save jsdom, then node --test tests/ui.dom.test.js
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./cep-fixture');
const root=path.resolve(__dirname,'../cep');
function waitFor(predicate){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-start>3000){clearInterval(timer);reject(Error('timeout'));}},10);});}
test('panel buttons drive analysis and build; warnings, stale plan and HTML are handled',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'});
  const w=dom.window,errors=[];w.addEventListener('error',event=>errors.push(event.message));
  w.eval('('+fixture.toString()+')()');w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  const $=id=>w.document.getElementById(id);$('buildMode').value='fast';
  function fill(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
  fill('audio','C:/voice.wav');fill('mediaDir','C:/images');fill('transcriptText','朝。電話。安心。');
  $('analyze').click();await waitFor(()=>$('scenes').children.length===3 && !$('analyze').disabled);
  assert.equal(w.__asvTest.requests[0].nativeCaptions,true);
  assert.equal(w.__asvTest.requests[0].motion,'auto');assert.equal(w.__asvTest.requests[0].imageShotSeconds,6);
  assert.match($('scenes').textContent,/Zoom in/);assert.match($('scenes').textContent,/Zoom out/);
  assert.equal($('motion').options.length,8);
  assert.equal($('captionPreviewWrap').hidden,false);assert.match($('captionPreview').textContent,/朝/);assert.equal($('captionPreview').tagName,'PRE');
  assert.equal($('build').disabled,true);assert.equal(w.document.querySelectorAll('#scenes img').length,0);
  $('accept').checked=true;$('accept').dispatchEvent(new w.Event('change'));
  assert.equal($('build').disabled,false);
  $('build').click();await waitFor(()=>$('status').textContent.startsWith('Đã tạo') && !$('analyze').disabled);
  assert.equal(w.__asvTest.meta.captionPath,'C:/data/jobs/test/timeline.srt');
  const steps=w.__asvTest.calls.filter(s=>s.startsWith('asvAdvance')).map(s=>JSON.parse('['+s.slice(s.indexOf('(')+1,-1)+']'));
  assert.equal(steps.length,5);assert.deepEqual(Array.from(steps.slice(0,3),s=>s[2].kind),['image','image','image']);
  assert.equal(steps[3][2],null);assert.equal(steps[4][2],null); // narration then native track
  assert.equal($('build').disabled,true);
  $('motion').value='pan_bottom_top';$('motion').dispatchEvent(new w.Event('change'));
  assert.equal($('build').disabled,true);
  $('mode').value='equal';$('mode').dispatchEvent(new w.Event('change'));
  assert.equal($('transcriptFields').hidden,true);assert.equal($('build').disabled,true);
  assert.equal($('captionSettings'),null);assert.equal($('captionPreviewWrap').hidden,true);
  assert.equal($('scenes').children.length,0);
  $('analyze').click();await waitFor(()=>!$('analyze').disabled && $('scenes').children.length===3);
  assert.equal(w.__asvTest.requests[1].motion,'pan_bottom_top');
  assert.equal(w.__asvTest.requests[1].nativeCaptions,false);assert.equal($('captionPreviewWrap').hidden,true);
  $('accept').checked=true;$('accept').dispatchEvent(new w.Event('change'));
  $('build').click();await waitFor(()=>$('status').textContent.startsWith('Đã tạo') && !$('analyze').disabled);
  assert.equal(w.__asvTest.meta.captionPath,'');
  assert.equal(w.__asvTest.calls.filter(s=>s.startsWith('asvAdvance')).length,9);
  assert.deepEqual(errors,[]);w.close();
});

test('v1 PNG checkbox preference migrates to native captions and obsolete style fields are ignored',()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'});
  const w=dom.window;
  w.localStorage.setItem('autoSyncVoice.v1',JSON.stringify({burnCaptions:false,captionSize:72,captionMargin:120}));
  w.eval('('+fixture.toString()+')()');w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  assert.equal(w.document.getElementById('nativeCaptions').checked,false);
  assert.equal(w.document.getElementById('captionSize'),null);assert.equal(w.document.getElementById('burnCaptions'),null);
  w.document.getElementById('nativeCaptions').dispatchEvent(new w.Event('change'));
  const saved=JSON.parse(w.localStorage.getItem('autoSyncVoice.v3'));
  assert.equal(saved.motion,'auto');assert.equal(saved.imageShotSeconds,'6');
  assert.equal(saved.nativeCaptions,false);assert.equal(saved.burnCaptions,undefined);dom.window.close();
});
test('native caption failure is shown, stops the host session and does not report completion',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'});
  const w=dom.window;w.eval('('+fixture.toString()+')()');w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  const $=id=>w.document.getElementById(id);$('buildMode').value='fast';
  $('audio').value='C:/voice.wav';$('mediaDir').value='C:/images';$('transcriptText').value='朝。電話。安心。';
  w.__asvTest.captionError='Premiere không xác nhận Caption Track.';
  $('analyze').click();await waitFor(()=>$('scenes').children.length===3 && !$('analyze').disabled);
  $('accept').checked=true;$('accept').dispatchEvent(new w.Event('change'));$('build').click();
  await waitFor(()=>$('status').textContent===w.__asvTest.captionError && !$('analyze').disabled);
  assert.equal($('build').disabled,true);assert.ok(w.__asvTest.calls.some(s=>s.startsWith('asvStop')));
  assert.equal(w.__asvTest.calls.filter(s=>s.startsWith('asvAdvance')).length,5);
  assert.ok(!$('log').textContent.includes('Hoàn tất'));w.close();
});

test('motion warning is visible in the panel after a completed build',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'});
  const w=dom.window;w.eval('('+fixture.toString()+')()');w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  const $=id=>w.document.getElementById(id);$('buildMode').value='fast';
  $('audio').value='C:/voice.wav';$('mediaDir').value='C:/images';$('transcriptText').value='朝。電話。安心。';
  w.__asvTest.motionWarnings=['Cảnh 1 (pan_top_bottom): không thêm được chuyển động.'];
  $('analyze').click();await waitFor(()=>$('scenes').children.length===3 && !$('analyze').disabled);
  $('accept').checked=true;$('accept').dispatchEvent(new w.Event('change'));$('build').click();
  await waitFor(()=>$('status').textContent.startsWith('Đã tạo') && !$('analyze').disabled);
  assert.match($('status').textContent,/1 cảnh báo chuyển động/);assert.equal($('warnings').hidden,false);
  assert.match($('warnings').textContent,/pan_top_bottom/);w.close();
});

test('compatibility option calls the original step method and persists across reload',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'});
  const w=dom.window;w.eval('('+fixture.toString()+')()');w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  const $=id=>w.document.getElementById(id);$('buildMode').value='fast';
  assert.equal($('buildMode').value,'fast');
  $('buildMode').value='safe';$('buildMode').dispatchEvent(new w.Event('change'));
  assert.equal(JSON.parse(w.localStorage.getItem('autoSyncVoice.v3')).buildMode,'safe');
  $('audio').value='C:/voice.wav';$('mediaDir').value='C:/images';$('transcriptText').value='朝。電話。安心。';
  $('analyze').click();await waitFor(()=>$('scenes').children.length===3 && !$('analyze').disabled);
  $('accept').checked=true;$('accept').dispatchEvent(new w.Event('change'));$('build').click();
  await waitFor(()=>$('status').textContent.startsWith('Đã tạo') && !$('analyze').disabled);
  assert.equal(w.__asvTest.calls.filter(s=>s.startsWith('asvStep')).length,5);
  assert.equal(w.__asvTest.calls.filter(s=>s.startsWith('asvAdvance')).length,0);
  assert.match($('log').textContent,/giây · 5 lượt xử lý · tương thích/);
  w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));assert.equal($('buildMode').value,'safe');w.close();
});

test('Stop in fast mode ends the session before submitting the next clip',async()=>{
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://local.test/',runScripts:'outside-only'});
  const w=dom.window;w.eval('('+fixture.toString()+')()');w.eval(fs.readFileSync(path.join(root,'panel.js'),'utf8'));
  const $=id=>w.document.getElementById(id);$('buildMode').value='fast';
  $('audio').value='C:/voice.wav';$('mediaDir').value='C:/images';$('transcriptText').value='朝。電話。安心。';
  $('analyze').click();await waitFor(()=>$('scenes').children.length===3 && !$('analyze').disabled);
  $('accept').checked=true;$('accept').dispatchEvent(new w.Event('change'));$('build').click();
  await waitFor(()=>w.__asvTest.calls.some(s=>s.startsWith('asvAdvance')));$('stop').click();
  await waitFor(()=>!$('analyze').disabled);
  assert.equal(w.__asvTest.calls.filter(s=>s.startsWith('asvAdvance')).length,1);
  assert.ok(w.__asvTest.calls.some(s=>s.startsWith('asvStop')));assert.ok(!$('log').textContent.includes('Hoàn tất'));w.close();
});
