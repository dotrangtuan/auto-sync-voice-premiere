// Simulated CEP/Python for UI contract tests; never loaded by production.
module.exports = function installMockCEP() {
    const state=window.__asvTest={requests:[],calls:[],profiles:[],meta:null};
    const plan={name:'Nhật ký buổi sáng',fps:30,duration:9,totalFrames:270,audio:'C:/voice.wav',fit:true,motion:'auto',imageShotSeconds:6,
      subtitlePath:'C:/data/jobs/test/timeline.srt',subtitleCues:[{text:'朝、あなたはお茶を入れます。',start:.2,end:2},{text:'電話。',start:3,end:6},{text:'安心。',start:7,end:8}],
      warnings:['Câu 2: độ khớp chữ thấp (60%), cần nghe kiểm tra.'],fingerprints:[],
      scenes:[{index:1,path:'C:/001.png',text:'朝、あなたはお茶を入れます。',startFrame:0,endFrame:75,confidence:1},
        {index:2,path:'C:/002.png',text:'突然、電話が鳴りました。',startFrame:75,endFrame:190,confidence:.6},
        {index:3,path:'C:/003.png',text:'<img onerror="alert(1)">も安心です。',startFrame:190,endFrame:270,confidence:1}],
      clips:[{path:'C:/001.png',kind:'image',startFrame:0,endFrame:75},{path:'C:/002.png',kind:'image',startFrame:75,endFrame:190},{path:'C:/003.png',kind:'image',startFrame:190,endFrame:270}]};
    const fakePath={join:(...p)=>p.join('/'),dirname:p=>p.slice(0,p.lastIndexOf('/')),basename:p=>p.split('/').pop()};
    const fakeFs={existsSync:()=>true,mkdirSync(){},writeFileSync(p,data){if(p.endsWith('request.json'))state.requests.push(JSON.parse(data));if(p.endsWith('build-profile.json'))state.profiles.push(JSON.parse(data));},statSync:()=>({isFile:()=>true,isDirectory:()=>true,size:123,mtimeMs:1000}),
      readFileSync(p){if(p.endsWith('runtime.json'))return JSON.stringify({python:'C:/python.exe',dataDir:'C:/data'});if(p.endsWith('.sqpreset'))return '<VideoFrameRate>10584000000</VideoFrameRate><VideoFrameSize>0,0,1280,720</VideoFrameSize><PreviewVideoFrameSize>0,0,1280,720</PreviewVideoFrameSize><AudioFrameRate>5760000</AudioFrameRate>';plan.captionTrack=(state.requests[state.requests.length-1] || {}).nativeCaptions?{path:plan.subtitlePath,format:'subtitle',cueCount:3}:null;plan.fingerprints=plan.captionTrack?[{path:plan.subtitlePath,size:123,mtimeNs:1000000000}]:[];plan.motion=(state.requests[state.requests.length-1] || {}).motion || 'none';plan.scenes.forEach((s,i)=>{s.motions=[plan.motion==='auto'?['zoom_in','zoom_out','pan_left_right'][i]:plan.motion];s.shotCount=1;});plan.clips.forEach((c,i)=>c.motion=plan.scenes[i].motions[0]);return JSON.stringify(plan);}};
    const fakeCP={spawn(){let output,closed;const process={stdout:{setEncoding(){},on(e,fn){output=fn;}},stderr:{setEncoding(){},on(){}},on(e,fn){if(e==='close'){closed=fn;setTimeout(()=>{output(JSON.stringify({type:'done'})+'\n');closed(0);},20);}return process;},kill(){closed(1);}};return process;}};
    window.cep_node={require(name){return name==='fs'?fakeFs:name==='path'?fakePath:name==='child_process'?fakeCP:{env:{LOCALAPPDATA:'C:/data'}};}};
    window.cep={fs:{showOpenDialogEx(){return {err:0,data:['C:/example']};}}};
    window.__adobe_cep__={getSystemPath(){return 'C:/extension';},evalScript(script,callback){
      state.calls.push(script);
      let result={ok:true};
      if(script.startsWith('asvInfo'))result={ok:true,version:'25.0 (simulated)',project:'C:/project.prproj'};
      if(script.startsWith('asvBegin')){state.meta=JSON.parse('['+script.slice(script.indexOf('(')+1,-1)+']')[0];result={ok:true,token:'test',sequence:'Nhật ký buổi sáng'};}
      if((script.startsWith('asvStep') || script.startsWith('asvAdvance'))){const args=JSON.parse('['+script.slice(script.indexOf('(')+1,-1)+']'),total=state.meta.clipCount+1+(state.meta.captionPath?1:0);result={ok:true,done:args[1]+1,total,pending:false,complete:args[1]===total-1,sequence:'Nhật ký buổi sáng',warnings:state.motionWarnings || []};if(state.captionError && state.meta.captionPath && args[1]===total-1)result={ok:false,error:state.captionError};}
      if(script.startsWith('asvPrepare'))result={ok:true,pending:false,waitMs:0};
      if(script.startsWith('asvBatch')){
        const args=JSON.parse('['+script.slice(script.indexOf('(')+1,-1)+']'),total=state.meta.clipCount+1+(state.meta.captionPath?1:0);
        result={ok:true,done:args[1]+args[2].length,total,pending:false,complete:args[1]+args[2].length===total,sequence:'Nhật ký buổi sáng',warnings:state.motionWarnings || []};
        if(state.captionError && state.meta.captionPath && args[1]===total-1)result={ok:false,error:state.captionError};
      }
      if(script.startsWith('asvMetrics'))result={ok:true,stats:{importMs:10,insertMs:20,trimMs:5,motionMs:30,validationMs:4,captionMs:10}};
      setTimeout(()=>callback(JSON.stringify(result)),10);
    }};
  
};
