(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var bridge = window.__adobe_cep__, req = window.cep_node ? window.cep_node.require : window.require;
  var fs, path, cp, nodeProcess, root, runtime, dataDir, busy = false, plan = null, planPath = '', child = null;
  var stopped = false, token = '', buildUsed = false, revision = 0;
  var fields = ['name','audio','mediaDir','size','fps','mode','transcriptPath','transcriptText','split','language','model','device','fit','motion','imageShotSeconds','nativeCaptions','buildMode','python'];
  function log(message) {
    $('log').textContent += '[' + new Date().toLocaleTimeString() + '] ' + message + '\n';
    $('log').scrollTop = $('log').scrollHeight;
  }
  function status(message, value) { $('status').textContent = message; if (value !== undefined) $('progress').value = value; }
  function scriptLiteral(value) { return JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'); }
  function host(method, args) {
    return new Promise(function(resolve,reject) {
      if (!bridge) return reject(Error('Mở extension trong Premiere để dựng timeline.'));
      bridge.evalScript(method + '(' + (args || []).map(scriptLiteral).join(',') + ')', function(raw) {
        try { var value=JSON.parse(raw); if(!value.ok)throw Error(value.error || raw); resolve(value); }
        catch(e) { reject(Error(raw === 'EvalScript error.' ? 'Premiere báo EvalScript error. Xem nhật ký hoặc khởi động lại panel.' : e.message)); }
      });
    });
  }
  function delay(ms) { return new Promise(function(resolve) { setTimeout(resolve,ms); }); }
  function mkdir(directory) { if(fs.existsSync(directory))return;var parent=path.dirname(directory);if(parent!==directory)mkdir(parent);try{fs.mkdirSync(directory);}catch(e){if(!fs.existsSync(directory))throw e;} }
  function validBuild() { return plan && !buildUsed && (!plan.warnings.length || $('accept').checked); }
  function setBusy(value) {
    busy = value;
    Array.prototype.forEach.call(document.querySelectorAll('input,select,textarea,button'),function(el) {
      el.disabled = value;
    });
    $('stop').disabled = !value;
    $('copyLog').disabled = false;
    $('build').disabled = value || !validBuild();
    $('openResults').disabled = value || !planPath;
  }
  function invalidate() {
    if (busy) return;
    revision++;plan=null;buildUsed=false;$('build').disabled=true;$('accept').checked=false;
    $('scenes').textContent='';$('warnings').hidden=true;$('acceptWrap').hidden=true;
    $('summary').textContent='Thiết lập đã thay đổi. Bấm Phân tích để cập nhật bảng ghép.';
    $('captionPreviewWrap').hidden=true;$('captionPreview').textContent='';
    save();
  }
  function save() {
    var value={};fields.forEach(function(id) { value[id]=$(id).type==='checkbox'?$(id).checked:$(id).value; });
    try { localStorage.setItem('autoSyncVoice.v3',JSON.stringify(value)); } catch(e) {}
  }
  function updateMode() {
    var mode=$('mode').value;
    $('transcriptFields').hidden=mode==='equal';$('textFields').hidden=mode!=='transcript';
    $('captionHelp').textContent=mode==='equal'?'Chia đều không có nội dung chữ. Chọn Transcript hoặc SRT/JSON để tạo Caption Track.':
      'Tạo Caption Track gốc, sửa chữ và thời gian trong Text → Captions. Chỉnh font/cỡ chữ trong Premiere. Khi xuất video, chọn Captions → Burn Captions Into Video nếu muốn gắn chữ vào hình.';
    $('modeHelp').textContent=mode==='equal'?'Chia thời lượng voice cho các media theo thứ tự tên file.':
      mode==='timed'?'Một cue SRT / một cảnh JSON ứng với một media. Caption giữ timestamp gốc; hình nối liên tục qua khoảng nghỉ. Không chạy Whisper.':
      'Mỗi câu/cảnh ứng với một media. File TXT được ưu tiên nếu đã chọn. Độ khớp là độ khớp chữ, không phải bảo đảm timing.';
  }
  function pick(id) {
    var types=id==='audio'?['wav','mp3','m4a','aac','flac','ogg']:id==='transcriptPath'?['txt','srt','json']:[];
    try {
      var result=window.cep.fs.showOpenDialogEx(false,id==='mediaDir','Chọn '+id,$(id).value || '',types);
      if(result && !result.err && result.data && result.data.length){$(id).value=result.data[0];invalidate();}
      else if(result && result.err)throw Error('Hộp thoại chọn file: mã '+result.err);
    }catch(e){log(e.message);status('Không mở được hộp thoại. Có thể dán đường dẫn vào ô.');}
  }
  function collect() {
    var request={};fields.forEach(function(id){request[id]=$(id).type==='checkbox'?$(id).checked:$(id).value.trim();});
    ['audio','mediaDir'].forEach(function(id){if(!request[id] || !fs.existsSync(request[id]))throw Error('Chưa chọn '+id+' hợp lệ.');});
    if(!fs.statSync(request.mediaDir).isDirectory())throw Error('Media phải là một thư mục.');
    if(!fs.statSync(request.audio).isFile())throw Error('Voice phải là một file.');
    if(request.mode==='timed' && !request.transcriptPath)throw Error('Chọn file SRT/JSON có timestamp.');
    if(request.mode==='transcript' && !request.transcriptPath && !request.transcriptText)throw Error('Chọn TXT hoặc dán kịch bản.');
    if(request.transcriptPath && !fs.existsSync(request.transcriptPath))throw Error('File transcript không tồn tại.');
    request.fps=Number(request.fps);request.dataDir=dataDir;
    request.imageShotSeconds=Number(request.imageShotSeconds);
    if(!isFinite(request.imageShotSeconds) || (request.imageShotSeconds!==0 && (request.imageShotSeconds<1 || request.imageShotSeconds>60)))throw Error('Độ dài shot ảnh: 1–60 giây, hoặc 0 để không chia.');
    if(request.mode==='equal')request.nativeCaptions=false;
    return request;
  }
  function pythonPath() {
    var executable=$('python').value.trim() || runtime.python;
    if(!executable || !fs.existsSync(executable))throw Error('Chưa có Python xử lý. Chạy CAI_DAT.cmd hoặc chỉ định python.exe đã cài requirements.txt.');
    return executable;
  }
  function runWorker(requestFile,outputFile) {
    return new Promise(function(resolve,reject){
      var buffer='',errors='',problem='',done=false;
      var environment=Object.assign({},nodeProcess.env,{PYTHONIOENCODING:'utf-8',PYTHONUNBUFFERED:'1',HF_HOME:path.join(dataDir,'huggingface')});
      child=cp.spawn(pythonPath(),['-u',path.join(root,'backend','worker.py'),requestFile,outputFile],{windowsHide:true,shell:false,env:environment});
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',function(chunk){
        buffer+=chunk;var index;
        while((index=buffer.indexOf('\n'))>=0){
          var line=buffer.slice(0,index);buffer=buffer.slice(index+1);
          try {
            var event=JSON.parse(line);
            if(event.type==='progress')status(event.message,event.value*100);
            if(event.type==='warning')log(event.message);
            if(event.type==='error')problem=event.message;
            if(event.type==='done')done=true;
          }catch(e){if(line.trim())log(line.slice(0,250));}
        }
      });
      child.stderr.on('data',function(chunk){errors=(errors+chunk).slice(-24000);});
      child.on('error',function(error){child=null;reject(error);});
      child.on('close',function(code){
        child=null;
        try { fs.writeFileSync(path.join(path.dirname(outputFile),'worker.log'),errors,'utf8'); }catch(e){}
        if(stopped)return reject(Error('Đã dừng phân tích.'));
        if(code!==0 || !done)return reject(Error(problem || 'Bộ xử lý dừng (mã '+code+'). '+errors.slice(-1200)));
        try{resolve(JSON.parse(fs.readFileSync(outputFile,'utf8')));}catch(e){reject(e);}
      });
    });
  }
  function time(frame,fps) {
    var sec=frame/fps,m=Math.floor(sec/60);return m+':'+('0'+Math.floor(sec%60)).slice(-2)+'.'+('00'+Math.round((sec%1)*1000)).slice(-3);
  }
  function motionName(value) {
    return {none:'Tĩnh',auto:'Luân phiên 6 kiểu',zoom_in:'Zoom in',zoom_out:'Zoom out',pan_left_right:'Trái → phải',pan_right_left:'Phải → trái',pan_top_bottom:'Trên → dưới',pan_bottom_top:'Dưới → trên'}[value] || value;
  }
  function showPlan(value) {
    var caption=value.captionTrack, first=(value.subtitleCues || [])[0];
    $('summary').textContent=value.scenes.length+' cảnh · '+value.clips.length+' đoạn trên V1 · '+(caption?caption.cueCount+' phụ đề / 1 Caption Track':'Không tạo Caption Track')+' · '+time(value.totalFrames,value.fps)+' · '+value.fps+' fps · '+motionName(value.motion || 'none');
    $('captionPreviewWrap').hidden=!caption;
    $('captionPreview').textContent=caption && first?time(first.start*value.fps,value.fps)+' → '+time(first.end*value.fps,value.fps)+'\n'+first.text:'';
    $('warnings').textContent=value.warnings.join('\n');$('warnings').hidden=!value.warnings.length;
    $('acceptWrap').hidden=!value.warnings.length;$('accept').checked=false;
    var fragment=document.createDocumentFragment();
    value.scenes.forEach(function(scene){
      var tr=document.createElement('tr'),idx=document.createElement('td'),media=document.createElement('td'),range=document.createElement('td'),score=document.createElement('td');
      idx.textContent=scene.index;media.textContent=path.basename(scene.path);
      if(scene.text){var small=document.createElement('small');small.textContent=scene.text;media.appendChild(small);}
      if(scene.motions && scene.motions.length){var movement=document.createElement('small');movement.textContent=scene.motions.length+' shot · '+scene.motions.slice(0,6).map(motionName).join(' / ')+(scene.motions.length>6?' / …':'');media.appendChild(movement);}
      range.textContent=time(scene.startFrame,value.fps)+'\n'+time(scene.endFrame,value.fps);range.style.whiteSpace='pre';
      score.textContent=scene.confidence===null?'—':Math.round(scene.confidence*100)+'%';
      if(scene.confidence!==null && scene.confidence<0.65)score.className='low';
      [idx,media,range,score].forEach(function(td){tr.appendChild(td);});fragment.appendChild(tr);
    });
    $('scenes').textContent='';$('scenes').appendChild(fragment);
  }
  function analyze() {
    if(busy)return;
    var request,outputFile,requestFile;
    try {
      request=collect();pythonPath();save();
      var jobDir=path.join(dataDir,'jobs',Date.now()+'-'+Math.random().toString(16).slice(2));mkdir(jobDir);
      requestFile=path.join(jobDir,'request.json');outputFile=path.join(jobDir,'timeline.json');
      fs.writeFileSync(requestFile,JSON.stringify(request),'utf8');
    }catch(e){log(e.message);status(e.message);return;}
    stopped=false;plan=null;planPath='';buildUsed=false;setBusy(true);status('Đang phân tích…',0);log('Bắt đầu '+request.mode+'.');
    runWorker(requestFile,outputFile).then(function(value){
      plan=value;planPath=outputFile;showPlan(plan);status('Đã phân tích. Kiểm tra bảng ghép rồi bấm Dựng timeline.',100);
      log('Kế hoạch: '+outputFile);
    }).catch(function(error){log(error.message);status(error.message,0);}).then(function(){setBusy(false);});
  }
  function verifyFiles(value) {
    value.fingerprints.forEach(function(item){
      var stat=fs.statSync(item.path);
      // Python stores nanoseconds; Node CEP may only expose milliseconds.
      if(stat.size!==item.size || Math.abs(stat.mtimeMs-item.mtimeNs/1000000)>2)throw Error('Media đã thay đổi: '+item.path+'. Phân tích lại.');
    });
  }
  function makePreset() {
    var dimensions=$('size').value.split('x'),width=Number(dimensions[0]),height=Number(dimensions[1]);
    var template=fs.readFileSync(path.join(root,'presets','base.sqpreset'),'utf8');
    template=template.replace(/<VideoFrameRate>[^<]+<\/VideoFrameRate>/,'<VideoFrameRate>'+(254016000000/plan.fps)+'</VideoFrameRate>')
      .replace(/<VideoFrameSize>[^<]+<\/VideoFrameSize>/,'<VideoFrameSize>0,0,'+width+','+height+'</VideoFrameSize>')
      .replace(/<PreviewVideoFrameSize>[^<]+<\/PreviewVideoFrameSize>/,'<PreviewVideoFrameSize>0,0,'+width+','+height+'</PreviewVideoFrameSize>')
      .replace(/<AudioFrameRate>[^<]+<\/AudioFrameRate>/,'<AudioFrameRate>5292000</AudioFrameRate>');
    var preset=path.join(path.dirname(planPath),'sequence.sqpreset');fs.writeFileSync(preset,template,'utf8');return preset;
  }
  async function build() {
    if(busy || !validBuild())return;
    stopped=false;token='';var completed=false,buildStarted=Date.now(),hostCalls=0;
    var buildMode=$('buildMode').value, turbo=buildMode==='turbo';
    var stepMethod=buildMode==='safe'?'asvStep':'asvAdvance';
    var buildLabel=turbo?'theo lô':buildMode==='safe'?'tương thích':'từng clip';
    try {
      verifyFiles(plan);var preset=makePreset();buildUsed=true;setBusy(true);status('Đang tạo sequence mới…',0);
      var result=await host('asvBegin',[{name:plan.name,fps:plan.fps,duration:plan.duration,totalFrames:plan.totalFrames,audio:plan.audio,
        clipCount:plan.clips.length,captionPath:plan.captionTrack?plan.captionTrack.path:'',fit:plan.fit,turbo:turbo},preset]);
      token=result.token;log('Sequence mới: '+result.sequence);
      var rows=plan.clips, total=rows.length+1+(plan.captionTrack?1:0);
      if(turbo){
        log('Dựng theo lô: vui lòng chờ hoàn tất rồi mới sửa timeline.');
        for(var offset=0;offset<rows.length;offset+=32){
          var chunk=rows.slice(offset,offset+32);
          status('Đang nhập media cho đoạn '+(offset+1)+'–'+(offset+chunk.length)+'…',100*offset/total);
          do{
            if(stopped)throw Error('Đã dừng. Sequence đang dở được giữ lại.');
            result=await host('asvPrepare',[token,chunk.map(function(row){return row.path;})]);hostCalls++;
            if(result.pending)await delay(result.waitMs===undefined?100:result.waitMs);
          }while(result.pending);
          for(var local=0;local<chunk.length;local+=8){
            var group=chunk.slice(local,local+8);
            do{
              if(stopped)throw Error('Đã dừng. Sequence đang dở được giữ lại.');
              result=await host('asvBatch',[token,offset+local,group]);hostCalls++;
              status('Đang dựng '+Math.min(result.done,rows.length)+'/'+rows.length+' đoạn…',100*result.done/total);
              // Even an immediate result yields so Stop can run between batches.
              await delay(result.pending?(result.waitMs===undefined?100:result.waitMs):0);
            }while(result.pending);
          }
        }
        // Keep narration and native captions separate from visual batches.
        for(var tail=rows.length;tail<total;tail++){
          if(tail===rows.length+1)verifyFiles({fingerprints:plan.fingerprints.filter(function(item){return item.path===plan.captionTrack.path;})});
          do{
            if(stopped)throw Error('Đã dừng. Sequence đang dở được giữ lại.');
            result=await host('asvBatch',[token,tail,[null]]);hostCalls++;
            status(tail===rows.length?'Đang ghép voice và kiểm tra toàn bộ timeline…':'Đang tạo Caption Track gốc…',100*result.done/result.total);
            await delay(result.pending?(result.waitMs===undefined?100:result.waitMs):0);
          }while(result.pending);
        }
      }else{
      for(var index=0;index<total;index++){
        if(index===rows.length+1)verifyFiles({fingerprints:plan.fingerprints.filter(function(item){return item.path===plan.captionTrack.path;})});
        do {
          if(stopped)throw Error('Đã dừng. Sequence đang dở được giữ lại.');
          result=await host(stepMethod,[token,index,index<rows.length?rows[index]:null]);hostCalls++;
          status(index<plan.clips.length?'Đang dựng đoạn '+(index+1)+'/'+plan.clips.length+'…':
            index===rows.length?'Đang ghép voice trên A1…':'Đang tạo Caption Track gốc từ SRT…',100*result.done/result.total);
          if(result.pending)await delay(120);
        }while(result.pending);
        // Let Stop/input events run even when Premiere completes a clip immediately.
        if(index<total-1)await delay(0);
      }
      }
      completed=result.complete;
      if(!completed)throw Error('Premiere chưa xác nhận hoàn tất.');
      log('Dựng timeline: '+((Date.now()-buildStarted)/1000).toFixed(1)+' giây · '+hostCalls+' lượt xử lý · '+buildLabel+'.');
      result.warnings.forEach(log);
      if(result.warnings.length){$('warnings').textContent=plan.warnings.concat(result.warnings).join('\n');$('warnings').hidden=false;}
      status('Đã tạo '+result.sequence+'. Kiểm tra và lưu project Premiere.'+(result.warnings.length?' Có '+result.warnings.length+' cảnh báo chuyển động, xem bảng và Nhật ký.':''),100);log('Hoàn tất '+plan.scenes.length+' cảnh'+(plan.captionTrack?', '+plan.captionTrack.cueCount+' phụ đề trên Caption Track gốc':'')+'. Phụ đề SRT: '+plan.subtitlePath);
      if(plan.captionTrack)log('Sửa phụ đề trong Text → Captions. Khi xuất, chọn Captions → Burn Captions Into Video để chữ xuất cùng hình.');
    }catch(error){log(error.message);status(error.message);}
    finally {
      if(token){
        try{
          var report=await host('asvMetrics',[token]);
          if(report.stats){
            var costs=report.stats;
            log('Chi phí API (giây): import '+(costs.importMs/1000).toFixed(2)+' · chèn '+(costs.insertMs/1000).toFixed(2)+' · cắt '+(costs.trimMs/1000).toFixed(2)+' · motion '+(costs.motionMs/1000).toFixed(2)+' · kiểm tra '+(costs.validationMs/1000).toFixed(2)+' · caption '+(costs.captionMs/1000).toFixed(2));
            fs.writeFileSync(path.join(path.dirname(planPath),'build-profile.json'),JSON.stringify({version:'0.4.0',mode:buildMode,completed:completed,wallSeconds:(Date.now()-buildStarted)/1000,hostCalls:hostCalls,visualClips:plan.clips.length,stats:costs},null,2),'utf8');
          }
        }catch(profileError){log('Không ghi được thống kê: '+profileError.message);}
      }
      if(token && !completed){try{await host('asvStop',[token]);}catch(e){log(e.message);}}
      setBusy(false);
    }
  }
  function terminateWorker() {
    if(!child)return;
    try {
      // Stop the worker and any decoder subprocesses together.
      if(nodeProcess.platform==='win32' && child.pid){
        var active=child;
        cp.spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false})
          .on('error',function(){try{active.kill();}catch(e){log(e.message);}})
          .on('close',function(code){if(code!==0){try{active.kill();}catch(e){log(e.message);}}});
      }else child.kill();
    }catch(e){log(e.message);}
  }
  function stop() {
    stopped=true;status('Đang dừng sau thao tác hiện tại…');
    terminateWorker();
  }
  function startup() {
    if(!req || !bridge)throw Error('Mở panel từ Premiere → Window → Extensions → Auto Sync Voice.');
    fs=req('fs');path=req('path');cp=req('child_process');nodeProcess=req('process');
    var raw=bridge.getSystemPath('extension');
    root=/^file:/i.test(raw)?decodeURI(raw.replace(/^file:\/\//i,'').replace(/^\/([A-Za-z]:)/,'$1')):raw;
    runtime={};var config=path.join(root,'runtime.json');if(fs.existsSync(config))runtime=JSON.parse(fs.readFileSync(config,'utf8').replace(/^\uFEFF/,''));
    dataDir=runtime.dataDir || path.join(nodeProcess.env.LOCALAPPDATA || root,'AutoSyncVoice');
    mkdir(dataDir);
    try { var stored=JSON.parse(localStorage.getItem('autoSyncVoice.v3') || localStorage.getItem('autoSyncVoice.v2') || localStorage.getItem('autoSyncVoice.v1') || '{}');if(stored.buildMode===undefined)stored.buildMode=stored.fastBuild===false?'safe':'turbo';if(stored.nativeCaptions===undefined && stored.burnCaptions!==undefined)stored.nativeCaptions=stored.burnCaptions;fields.forEach(function(id){if(stored[id]!==undefined){if($(id).type==='checkbox')$(id).checked=stored[id];else $(id).value=stored[id];}}); }catch(e){}
    fields.forEach(function(id){$(id).addEventListener('change',function(){invalidate();updateMode();});$(id).addEventListener('input',invalidate);});
    Array.prototype.forEach.call(document.querySelectorAll('[data-pick]'),function(button){button.addEventListener('click',function(){pick(button.getAttribute('data-pick'));});});
    $('clearTranscript').onclick=function(){$('transcriptPath').value='';invalidate();};
    $('analyze').onclick=analyze;$('build').onclick=build;$('stop').onclick=stop;
    $('resetSession').onclick=function(){host('asvStop',['']).then(function(){status('Đã kết thúc phiên cũ. Sequence đang dở vẫn được giữ.');log('Đã kết thúc phiên dựng bị gián đoạn.');}).catch(function(e){log(e.message);});};
    $('accept').onchange=function(){$('build').disabled=busy || !validBuild();};
    $('openResults').onclick=function(){if(planPath)cp.spawn('explorer.exe',[path.dirname(planPath)],{windowsHide:true,shell:false}).on('error',function(e){log(e.message);});};
    $('copyLog').onclick=function(){var area=document.createElement('textarea');area.value=$('log').textContent;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();};
    window.addEventListener('beforeunload',terminateWorker);
    if(['turbo','fast','safe'].indexOf($('buildMode').value)<0)$('buildMode').value='turbo';
    updateMode();setBusy(false);
    host('asvInfo').then(function(info){$('hostInfo').textContent='Premiere '+info.version+' · '+(info.project?'Đã mở project':'Chưa lưu project');log('Python: '+(runtime.python || 'chưa cấu hình'));if(info.interrupted){log('Có phiên dựng bị gián đoạn. Mở Nhật ký & thiết lập → Kết thúc phiên bị gián đoạn trước khi dựng mới.');status('Có phiên cũ chưa kết thúc. Xem Nhật ký & thiết lập.');}})
      .catch(function(e){status(e.message);log(e.message);});
  }
  try{startup();}catch(error){status(error.message);log(error.message);$('analyze').disabled=true;$('build').disabled=true;}
})();
