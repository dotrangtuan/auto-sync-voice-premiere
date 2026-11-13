// Operation counts, NOT real Adobe wall-clock time.
// node tests/benchmark-batch.js /path/to/0.3.1/cep/host.jsx [count]
'use strict';
const fs=require('node:fs'),fixture=require('./host-fixture');
const n=Number(process.argv[3] || 500);
if(!Number.isInteger(n) || n<1 || n>10000)throw Error('count: 1..10000');
const baseline=process.argv[2]?fs.readFileSync(process.argv[2],'utf8'):undefined;
function run(turbo){
  const f=fixture({source:turbo?undefined:baseline});Object.assign(f.meta,{turbo,clipCount:n,duration:n,totalFrames:n*30});
  const b=f.begin();if(!b.ok)throw Error(b.error);
  const rows=Array.from({length:n},(_,i)=>({path:'C:/'+i+'.png',kind:'image',sceneIndex:i+1,startFrame:i*30,endFrame:(i+1)*30,motion:'none'}));
  let calls=0,waitMs=0;
  function poll(method,...args){for(let attempt=0;attempt<1000;attempt++){const r=f.call(method,...args);calls++;if(!r.ok)throw Error(r.error);if(!r.pending)return r;waitMs+=turbo?r.waitMs:120;}throw Error('timeout');}
  if(turbo){
    for(let i=0;i<n;i+=32){const chunk=rows.slice(i,i+32);poll('asvPrepare',b.token,chunk.map(r=>r.path));for(let j=0;j<chunk.length;j+=8)poll('asvBatch',b.token,i+j,chunk.slice(j,j+8));}
    if(!poll('asvBatch',b.token,n,[null]).complete)throw Error('not complete');
  }else{rows.forEach((r,i)=>poll('asvAdvance',b.token,i,r));if(!poll('asvAdvance',b.token,n,null).complete)throw Error('not complete');}
  const st=f.context.$.global.asvState;
  return {mode:turbo?'0.4.0 batch':'0.3.1 fast (if supplied)',images:n,processingCalls:calls,importCalls:f.imports,clipVerificationVisits:f.metrics.snapshotClipVisits+(st.stats?st.stats.clipReads:0),mediaPathReads:f.metrics.mediaPaths,fullAudits:st.stats?st.stats.fullAudits:undefined,scheduledPollingSeconds:waitMs/1000};
}
console.log(JSON.stringify({note:'Immediate mocked DOM, no Adobe IO/rendering, motion disabled. Counts exclude begin and profiling call; scheduled timer waits are not wall time.',results:[run(false),run(true)]},null,2));
