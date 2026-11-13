'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cep/host.jsx'),'utf8'),T=254016000000,F=T/30;
function fixture(options={}){
  let next=1,queued=[],insertions=0,imports=0,captionCalls=[],importedPaths=[];
  const metrics={calls:0,snapshots:0,snapshotClipVisits:0,mediaPaths:0};
  class Time{constructor(){this._ticks=0;}get ticks(){return String(this._ticks);}set ticks(v){this._ticks=Number(v);}get seconds(){return this._ticks/T;}set seconds(v){this._ticks=v*T;}}
  const tm=v=>{let t=new Time();t.ticks=String(v);return t;};
  function coll(items,property){Object.defineProperty(items,property,{get(){return this.length;}});return items;}
  function item(file){return {nodeId:'i'+next++,name:file.split('/').pop(),type:1,getMediaPath(){metrics.mediaPaths++;return options.emptySrtPath && /\.srt$/i.test(file)?'':file;},isOffline(){return false;},setScaleToFrameSize(){this.fit=true;}};}
  function bin(name){return {name,type:2,children:coll([],'numItems'),createBin(n){let b=bin(n);this.children.push(b);return b;}};}
  function track(seq,isAudio){
    const tr={clips:coll([],'numItems'),locked:false,isLocked(){return this.locked;},overwriteClip(it,seconds){
      insertions++;
      const add=()=>{
        function clip(target){
          let end=tm(seconds*T+5*T),c={nodeId:'c'+next++,projectItem:it,start:tm(seconds*T),inPoint:tm(0),outPoint:tm(5*T),disabled:false,
            components:coll([],'numItems'),remove(){target.clips.splice(target.clips.indexOf(this),1);}};
          Object.defineProperty(c,'end',{get(){return end;},set(v){if(!options.refuseTrim)end=v;}});target.clips.push(c);return c;
        }
        clip(tr);
        if(!isAudio && /\.mp4$/i.test(it.getMediaPath()))clip(seq.audioTracks[0]);
      };
      if(options.delayInsertion)queued.push({ticks:2,run:add});else add();
    }};return tr;
  }
  function seq(name){const s={name,sequenceID:'s'+next++,timebase:String(F)};s.videoTracks=coll(Array.from({length:options.videoTracks || 1},()=>track(s,false)),'numTracks');s.audioTracks=coll([track(s,true)],'numTracks');if(!options.noCaptionAPI)s.createCaptionTrack=function(item,offset){captionCalls.push({item,offset,voiceCount:s.audioTracks[0].clips.length});if(options.captionThrows)throw Error('Native caption failure');return options.captionResult===undefined?true:options.captionResult;};return s;}
  const original=seq('User original'),project={path:'C:/project.prproj',documentID:'doc',rootItem:bin('root'),sequences:coll([original],'numSequences'),activeSequence:original,
    openSequence(id){this.activeSequence=this.sequences.find(s=>s.sequenceID===id);},
    importFiles(paths,suppress,target){imports++;importedPaths.push(paths.slice());if(options.refuseBulk && paths.length>1)return false;if(options.refuseSrtImport && /\.srt$/i.test(paths[0]))return false;const add=()=>{(options.partialImport?paths.slice(0,1):paths).forEach(p=>target.children.push(item(p)));if(options.reverseBin)target.children.reverse();};if(options.delayImport)queued.push({ticks:2,run:add});else add();return true;}};
  const context=vm.createContext({app:{version:'25.0',project,enableQE(){}},qe:{project:{newSequence(name){project.sequences.push(seq(name));}}},
    $:{global:{}},Time,File:function(p){this.fsName=String(p);this.exists=!String(p).includes('missing');}});
  vm.runInContext(options.source || source,context);
  const snapshot=context.asvSnapshot;
  context.asvSnapshot=function(seq,...args){metrics.snapshots++;for(const track of [...seq.videoTracks,...seq.audioTracks])metrics.snapshotClipVisits+=track.clips.length;return snapshot(seq,...args);};
  function call(name,...args){metrics.calls++;const result=JSON.parse(vm.runInContext(name+'('+args.map(x=>JSON.stringify(x)).join(',')+')',context));for(const q of [...queued])if(--q.ticks<=0){queued.splice(queued.indexOf(q),1);q.run();}return result;}
  const meta={name:'Test',fps:30,duration:3,totalFrames:90,audio:'C:/voice.wav',clipCount:2,fit:true,zoom:false};
  function begin(){return call('asvBegin',meta,'C:/preset.sqpreset');}
  function step(token,index,row){for(let i=0;i<100;i++){const result=call(options.fast?'asvAdvance':'asvStep',token,index,row);if(!result.ok || !result.pending)return result;}throw Error('infinite pending');}
  return {call,begin,step,metrics,project,original,meta,context,captionCalls,importedPaths,get insertions(){return insertions;},get imports(){return imports;}};
}

module.exports=fixture;
