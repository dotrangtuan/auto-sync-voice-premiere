// Real host motion implementation against ComponentParam doubles.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cep/host.jsx'),'utf8');
const T=254016000000,F=T/30;
const copy=v=>Array.isArray(v)?v.slice():v;
function setup(preset,kind='image',options={}){
  const updates=[];
  function param(initial,fail){
    return {value:copy(initial),varying:false,keys:new Map(),interpolation:new Map(),
      areKeyframesSupported(){return !options.unsupported;},isTimeVarying(){return this.varying;},
      getValue(){return copy(this.value);},setValue(v,ui){updates.push(ui);this.value=copy(v);return 0;},
      setTimeVarying(v){this.varying=v;return 0;},
      addKey(t){this.keys.set(Number(t.ticks),this.value);return 0;},
      removeKey(t){this.keys.delete(Number(t.ticks));return 0;},
      setValueAtKey(t,v,ui){updates.push(ui);if(fail==='reject')return 1;if(fail==='throw')throw Error('Position rejected');if(fail!=='silent')this.keys.set(Number(t.ticks),copy(v));return 0;},
      getValueAtKey(t){return copy(this.keys.get(Number(t.ticks)));},
      setInterpolationTypeAtKey(t,v,ui){updates.push(ui);this.interpolation.set(Number(t.ticks),v);return options.rejectInterpolation?1:0;}};
  }
  const scale=param(options.scale || 100),position=param(options.center || [.5,.5],options.positionFailure),uniform=param(true);
  const components=[{matchName:'AE.ADBE Motion',properties:[position,scale,{},uniform]}];components.numItems=1;
  if(options.preAnimated)scale.varying=true;
  if(options.missingReadback)delete position.getValueAtKey;
  const clip={components,inPoint:{ticks:String(options.inTicks || 0)}};
  const row={kind,motion:preset,sceneIndex:1,startFrame:300,endFrame:options.oneFrame?301:420};
  const st={meta:{turbo:!!options.turbo},timebase:String(F),warnings:[]};
  const context=vm.createContext({$:{global:{}},Time:function(){this.ticks='0';}});
  vm.runInContext(source,context);context.asvStyle(st,clip,row);
  return {scale,position,uniform,st,updates};
}
const pans={pan_left_right:[[.475,.5],[.525,.5]],pan_right_left:[[.525,.5],[.475,.5]],pan_top_bottom:[[.5,.475],[.5,.525]],pan_bottom_top:[[.5,.525],[.5,.475]]};
for(const kind of ['image','video'])for(const preset of ['zoom_in','zoom_out',...Object.keys(pans)]){
  test(kind+' '+preset+' writes native endpoint keys and linear interpolation',()=>{
    const {scale,position,st}=setup(preset,kind,{inTicks:2*T});assert.deepEqual(st.warnings,[]);
    assert.deepEqual([...scale.keys.keys()],[2*T,2*T+119*F]); // source time, last visible frame
    const expected=preset==='zoom_in'?[100,108]:preset==='zoom_out'?[108,100]:[106,106];
    assert.deepEqual([...scale.keys.values()],expected);assert.deepEqual([...scale.interpolation.values()],[0,0]);
    if(pans[preset]){
      assert.deepEqual([...position.keys.values()].map(v=>Array.from(v)),pans[preset]);
      assert.deepEqual([...position.interpolation.values()],[0,0]);
    }else assert.equal(position.keys.size,0);
  });
}
test('motion is relative to the imported/fitted scale',()=>{
  assert.deepEqual([...setup('zoom_in','image',{scale:50}).scale.keys.values()],[50,54]);
});
for(const kind of ['audio','caption'])test(kind+' is never animated',()=>{
  const r=setup('zoom_in',kind);assert.equal(r.scale.keys.size,0);assert.equal(r.position.keys.size,0);
});
test('none and one-frame clips remain static',()=>{
  assert.equal(setup('none').scale.keys.size,0);assert.equal(setup('zoom_in','image',{oneFrame:true}).scale.keys.size,0);
});
for(const failure of ['reject','throw','silent'])test('partial pan failure '+failure+' restores static scale and position',()=>{
  const r=setup('pan_left_right','image',{positionFailure:failure});
  assert.equal(r.st.warnings.length,1);assert.equal(r.scale.keys.size,0);assert.equal(r.position.keys.size,0);
  assert.equal(r.scale.varying,false);assert.equal(r.position.varying,false);
  assert.equal(r.scale.value,100);assert.deepEqual(Array.from(r.position.value),[.5,.5]);assert.equal(r.uniform.value,true);
});
test('unsupported, unknown coordinate systems, existing animation and missing readback do not mutate',()=>{
  for(const options of [{unsupported:true},{center:[960,540]},{center:[NaN,.5]},{preAnimated:true},{missingReadback:true}]){
    const r=setup('pan_top_bottom','video',options);assert.equal(r.st.warnings.length,1);
    assert.equal(r.scale.keys.size,0);assert.equal(r.position.keys.size,0);assert.equal(r.scale.value,100);
  }
});
test('failed interpolation is surfaced and changes are rolled back',()=>{
  const r=setup('zoom_out','image',{rejectInterpolation:true});assert.equal(r.st.warnings.length,1);assert.equal(r.scale.keys.size,0);assert.equal(r.scale.value,100);
});

for(const preset of ['zoom_in','pan_left_right','pan_top_bottom'])test('turbo coalesces redraws without changing motion: '+preset,()=>{
  const a=setup(preset),b=setup(preset,'image',{turbo:true});
  assert.equal(b.updates.filter(Boolean).length,1);
  assert.ok(a.updates.filter(Boolean).length>=5);
  assert.deepEqual([...a.scale.keys.entries()],[...b.scale.keys.entries()]);
  assert.deepEqual([...a.position.keys.entries()].map(([k,v])=>[k,Array.from(v)]),[...b.position.keys.entries()].map(([k,v])=>[k,Array.from(v)]));
  assert.deepEqual(b.st.warnings,[]);
});
test('turbo motion rollback restores static values on rejected deferred writes',()=>{
  const b=setup('pan_left_right','image',{turbo:true,positionFailure:'silent'});
  assert.equal(b.st.warnings.length,1);assert.equal(b.scale.keys.size,0);assert.equal(b.scale.value,100);
  assert.deepEqual(Array.from(b.position.value),[.5,.5]);assert.ok(b.updates.some(Boolean));
});
