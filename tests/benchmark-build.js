// Synthetic CEP scheduling benchmark, not a real Premiere performance claim.
// node tests/benchmark-build.js [optional-path-to-original-host.jsx] [clip-count]
'use strict';
const fs=require('node:fs'),fixture=require('./host-fixture');
const count=Number(process.argv[3] || 500);
if(!Number.isInteger(count) || count<1 || count>10000)throw Error('clip count: 1..10000');
function run(label,source,method){
  const f=fixture({source});Object.assign(f.meta,{clipCount:count,duration:count,totalFrames:count*30});
  const b=f.begin();if(!b.ok)throw Error(b.error);
  let pending=0,calls=0;
  for(let i=0;i<=count;i++){
    const row=i<count?{path:'C:/'+String(i+1)+'.png',kind:'image',sceneIndex:i+1,startFrame:i*30,endFrame:(i+1)*30,motion:'none'}:null;
    let result;
    do{result=f.call(method,b.token,i,row);calls++;if(!result.ok)throw Error(result.error);if(result.pending)pending++;}while(result.pending);
    if(i===count && !result.complete)throw Error('incomplete');
  }
  return {label,visualClips:count,bridgeCalls:calls,scheduledWaitSeconds:pending*0.12,snapshotCalls:f.metrics.snapshots,snapshotClipVisits:f.metrics.snapshotClipVisits,mediaPathReads:f.metrics.mediaPaths};
}
const old=process.argv[2]?fs.readFileSync(process.argv[2],'utf8'):undefined;
console.log(JSON.stringify({note:'Immediate mocked DOM, no motion rendering/import latency. Wait time counts the panel 120 ms timers, not wall time.',results:[run(old?'0.3.0 original':'0.3.1 compatible',old,'asvStep'),run('0.3.1 fast',undefined,'asvAdvance')]},null,2));
