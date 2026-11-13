// Auto Sync Voice 0.4.0. ES3-compatible CEP host.
// Based on the guarded import/insert/readback pattern in the supplied Auto Queue.
var ASV_TICKS = 254016000000;
if (!$.global.asvState) $.global.asvState = null;

function asvJSON(o) {
    if (o === null || o === undefined) return 'null';
    var t = typeof o, a = [], k;
    if (t === 'number') return isFinite(o) ? String(o) : 'null';
    if (t === 'boolean') return o ? 'true' : 'false';
    if (t === 'string') return '"' + o.replace(/[\\"\x00-\x1f]/g, function(c) {
        if (c === '\\') return '\\\\';
        if (c === '"') return '\\"';
        var h = c.charCodeAt(0).toString(16); return '\\u' + ('0000'+h).slice(-4);
    }) + '"';
    if (o instanceof Array) { for(k=0;k<o.length;k++) a.push(asvJSON(o[k])); return '['+a.join(',')+']'; }
    for(k in o) if(o.hasOwnProperty(k)) a.push(asvJSON(String(k))+':'+asvJSON(o[k]));
    return '{'+a.join(',')+'}';
}
function asvError(error) { return asvJSON({ok:false,error:String(error.message || error)}); }
function asvProjectID() { return String(app.project.documentID || '')+'|'+String(app.project.path || ''); }
function asvPath(path) { return new File(path).fsName.toLowerCase(); }
function asvTime(ticks) { var t=new Time(); t.ticks=String(Math.round(ticks)); return t; }
function asvSnapshot(seq, omit, capture) {
    var result=[String(seq.sequenceID),String(seq.timebase)], full=capture?result.slice(0):null, groups=[seq.videoTracks,seq.audioTracks];
    for(var g=0;g<groups.length;g++) {
        for(var t=0;t<groups[g].numTracks;t++) {
            var track=groups[g][t], rows=[], all=capture?[]:null;
            for(var i=0;i<track.clips.numItems;i++) {
                var c=track.clips[i], row=[String(c.nodeId),String(c.projectItem.nodeId),String(c.start.ticks),String(c.end.ticks),String(c.inPoint.ticks),String(c.outPoint.ticks),!!c.disabled];
                if(capture)all.push(row);
                if(!omit || String(c.nodeId)!==String(omit.nodeId))rows.push(row);
            }
            var locked=!!track.isLocked();result.push([locked,rows]);
            if(capture)full.push([locked,all]);
        }
    }
    if(capture)capture.snapshot=asvJSON(full);
    return asvJSON(result);
}
function asvValidate(st, snapshot, allowFinished) {
    if(!st || (st.finished && !allowFinished) || st.failed) throw Error('Phiên dựng đã kết thúc. Hãy tạo sequence mới.');
    if(st.project!==asvProjectID()) throw Error('Project đã thay đổi. Dừng dựng.');
    if(!app.project.activeSequence || String(app.project.activeSequence.sequenceID)!==String(st.seq.sequenceID)) throw Error('Bạn đã đổi sequence. Dừng dựng để tránh chèn nhầm.');
    if(String(st.seq.timebase)!==st.timebase) throw Error('FPS sequence đã thay đổi.');
    if(snapshot) {
        if(st.meta.turbo)asvLedgerCheck(st,null,st.finished);
        else if(asvMeasure(st,'validationMs',function(){return asvSnapshot(st.seq);})!==st.snapshot)throw Error('Timeline đã được chỉnh sửa trong lúc dựng. Đã dừng.');
    }
}
function asvFind(bin, path) {
    // Newly imported items normally appear at the end of this private bin.
    for(var i=bin.children.numItems-1;i>=0;i--) {
        var item=bin.children[i];
        try { if(asvPath(item.getMediaPath())===asvPath(path)) return item; } catch(e) {}
        if(item.type===2) { var found=asvFind(item,path); if(found)return found; }
    }
    return null;
}
function asvStatus(st, pending, waitMs) {
    return asvJSON({ok:true,token:st.token,sequence:String(st.seq.name),sequenceID:String(st.seq.sequenceID),
        done:st.next,total:st.total,complete:!!st.finished,pending:!!pending,waitMs:waitMs===undefined?120:waitMs,warnings:st.warnings,stats:st.stats});
}
// Only aggregate CPU-side host costs; disk/Adobe latency remains machine-dependent.
function asvMeasure(st,key,fn) {
    var started=new Date().getTime();
    try{return fn();}finally{if(st && st.stats)st.stats[key]+=new Date().getTime()-started;}
}
function asvImport(st,paths) {
    st.stats.importCalls++;
    return asvMeasure(st,'importMs',function(){return app.project.importFiles(paths,true,st.bin,false);});
}
function asvStamp(st,c) {
    st.stats.clipReads++;
    return asvJSON([String(c.nodeId),String(c.projectItem.nodeId),String(c.start.ticks),String(c.end.ticks),String(c.inPoint.ticks),String(c.outPoint.ticks),!!c.disabled]);
}
function asvLedgerInit(st) {
    st.ledger=[[],[]];st.auditAt=32;st.binSeen={};
    var groups=[st.seq.videoTracks,st.seq.audioTracks];
    for(var g=0;g<2;g++)for(var t=0;t<groups[g].numTracks;t++)st.ledger[g].push([]);
}
// O(1) boundary checks per track; complete audits at 32/64/128/... clips and
// before narration, after narration, and around caption creation. No user edits
// should be made during a build. Interior edits are caught at the next audit.
function asvLedgerCheck(st,omit,force) {
    return asvMeasure(st,'validationMs',function(){
        var full=!!force || st.next>=st.auditAt;
        var groups=[st.seq.videoTracks,st.seq.audioTracks];
        var omitGroup=st.pending && st.pending.row && st.pending.row.kind==='audio'?1:0;
        if(full)st.stats.fullAudits++;
        for(var g=0;g<2;g++){
            if(groups[g].numTracks!==st.ledger[g].length)throw Error('Số track đã thay đổi trong khi dựng.');
            for(var t=0;t<groups[g].numTracks;t++){
                var track=groups[g][t],expected=st.ledger[g][t],extra=omit && g===omitGroup && t===0?1:0;
                if(track.isLocked() || track.clips.numItems!==expected.length+extra)throw Error('Track bị khóa hoặc số clip đã thay đổi trong khi dựng.');
                if(extra && String(track.clips[expected.length].nodeId)!==String(omit.nodeId))throw Error('Clip mới không nằm ở cuối track dự kiến.');
                if(full){
                    for(var i=0;i<expected.length;i++)if(asvStamp(st,track.clips[i])!==expected[i])throw Error('Timeline đã thay đổi ở clip '+(i+1)+'. Đã dừng.');
                }else if(expected.length){
                    if(asvStamp(st,track.clips[expected.length-1])!==expected[expected.length-1])throw Error('Clip cuối đã thay đổi trong khi dựng.');
                    if(expected.length>1 && asvStamp(st,track.clips[0])!==expected[0])throw Error('Clip đầu đã thay đổi trong khi dựng.');
                }
            }
        }
        if(st.next>=st.auditAt)while(st.auditAt<=st.next)st.auditAt*=2;
    });
}
function asvLedgerCommit(st,clip,audio) {st.ledger[audio?1:0][0].push(asvStamp(st,clip));}
function asvCheckExisting(st,added,capture) {
    if(st.meta.turbo)asvLedgerCheck(st,added,false);
    else if(asvMeasure(st,'validationMs',function(){return asvSnapshot(st.seq,added,capture);})!==st.snapshot)throw Error('Timeline đã được chỉnh sửa trong khi xác nhận clip.');
}
function asvIndexBin(st,bin) {
    for(var i=0;i<bin.children.numItems;i++){
        var item=bin.children[i],id='$'+String(item.nodeId);
        if(item.type===2){asvIndexBin(st,item);continue;}
        if(st.binSeen[id])continue;
        var path='';try{path=item.getMediaPath();}catch(e){}
        if(path){st.items['$'+asvPath(path)]=item;st.binSeen[id]=true;}
    }
}
// Imports a bounded unique group once. Subsequent identical requests only poll.
// A partial/uncertain import fails closed; it is never re-submitted automatically.
function asvPrepare(token,paths) {
    var st=$.global.asvState;
    try{
        if(!st || st.token!==token)throw Error('Phiên dựng không còn hiệu lực.');
        asvValidate(st,true);
        if(!st.meta.turbo || st.pending)throw Error('Không thể chuẩn bị media ở bước hiện tại.');
        if(!(paths instanceof Array) || !paths.length || paths.length>32)throw Error('Lô import cần từ 1 đến 32 đường dẫn.');
        var key=asvJSON(paths),p=st.preload,i;
        if(p && p.key!==key)throw Error('Lô media thay đổi trong lúc đang import.');
        if(!p){
            var unique={},missing=[];
            for(i=0;i<paths.length;i++){
                if(typeof paths[i]!=='string' || !new File(paths[i]).exists)throw Error('Media không tồn tại trong lô.');
                var k='$'+asvPath(paths[i]);
                if(!unique[k] && !st.items[k])missing.push(new File(paths[i]).fsName);
                unique[k]=true;
            }
            if(!missing.length)return asvStatus(st,false,0);
            p={key:key,started:new Date().getTime(),attempts:0};st.preload=p;
            if(!asvImport(st,missing))throw Error('Premiere từ chối import lô media. Không tự import lại.');
        }
        asvIndexBin(st,st.bin);
        var remaining=[];
        for(i=0;i<paths.length;i++)if(!st.items['$'+asvPath(paths[i])])remaining.push(paths[i]);
        if(remaining.length){
            p.attempts++;
            if(p.attempts>=1200 || new Date().getTime()-p.started>120000)throw Error('Import lô chưa đầy đủ: '+remaining[0]+'. Không tự import lại.');
            return asvStatus(st,true,100);
        }
        st.preload=null;return asvStatus(st,false,0);
    }catch(e){
        if(st && st.token===token){st.failed=true;st.finished=true;}
        return asvError(String(e.message||e)+' Sequence đang dở được giữ lại.');
    }
}
// Up to eight clips / 32 state transitions; cooperative yield after ~80 ms.
// One slow native call may exceed that budget. Never run parallel mutations.
function asvBatch(token,start,rows) {
    var st=$.global.asvState;
    try{
        if(!st || st.token!==token)throw Error('Phiên dựng không còn hiệu lực.');
        if(!st.meta.turbo || !(rows instanceof Array) || !rows.length || rows.length>8 || typeof start!=='number' || start<0 || Math.floor(start)!==start || start+rows.length>st.total)throw Error('Lô clip không hợp lệ.');
        var key=asvJSON([start,rows]),end=start+rows.length,b=st.batch;
        if(b && b.key===key && st.next===end){asvValidate(st,true,true);return asvStatus(st,false,0);}
        asvValidate(st,false);
        if(st.preload)throw Error('Lô media chưa import xong.');
        if(!b || b.key!==key){
            if(st.pending || (b && st.next<b.end) || start!==st.next)throw Error('Thứ tự hoặc nội dung lô clip đã thay đổi.');
            b={key:key,start:start,end:end};st.batch=b;
        }
        var deadline=new Date().getTime()+80,count=0,result;
        do{
            var index=st.next,phase=st.pending?st.pending.phase:'';
            result=asvStep(token,index,rows[index-start]);
            if(st.failed)return result;
            if(st.next>=end)return asvStatus(st,false,0);
            if(st.next===index && (st.pending?st.pending.phase:'')===phase)return asvStatus(st,true,100);
            count++;
        }while(count<32 && new Date().getTime()<deadline);
        return asvStatus(st,true,0);
    }catch(e){
        if(st && st.token===token){st.failed=true;st.finished=true;}
        return asvError(String(e.message||e)+' Sequence đang dở được giữ lại.');
    }
}

function asvInfo() {
    try { return asvJSON({ok:true,version:String(app.version),project:app.project?String(app.project.path):'',
        sequence:app.project && app.project.activeSequence?String(app.project.activeSequence.name):'',
        interrupted:!!($.global.asvState && !$.global.asvState.finished && !$.global.asvState.failed)}); }
    catch(e) { return asvError(e); }
}
function asvBegin(meta, presetPath) {
    var created=null;
    try {
        if(!app.project || !app.project.path) throw Error('Hãy mở và lưu project Premiere trước.');
        var old=$.global.asvState;
        if(old && !old.finished && !old.failed) throw Error('Đang có phiên dựng. Bấm Dừng trước khi tạo lại.');
        if(meta.fps!==24 && meta.fps!==25 && meta.fps!==30 && meta.fps!==60) throw Error('FPS không hợp lệ.');
        if(!isFinite(meta.duration) || meta.duration<=0 || meta.duration>86400 || Math.abs(meta.totalFrames-Math.ceil(meta.duration*meta.fps-0.00000001))>0)throw Error('Thời lượng voice và tổng frame không khớp.');
        if(!isFinite(meta.totalFrames) || meta.totalFrames<1 || Math.floor(meta.totalFrames)!==meta.totalFrames || meta.totalFrames>meta.fps*86400) throw Error('Thời lượng phải từ một frame đến 24 giờ.');
        if(!meta.clipCount || meta.clipCount>10000 || Math.floor(meta.clipCount)!==meta.clipCount) throw Error('Số clip không hợp lệ.');
        meta.captionPath=meta.captionPath || '';
        if(meta.captionPath && (!/\.srt$/i.test(meta.captionPath) || !new File(meta.captionPath).exists))throw Error('Không tìm thấy file SRT cho Caption Track.');
        var audio=new File(meta.audio), preset=new File(presetPath);
        if(!audio.exists || !preset.exists) throw Error('Không tìm thấy voice hoặc preset sequence.');
        var seqs=app.project.sequences, ids={}, names={}, i;
        for(i=0;i<seqs.numSequences;i++){ids['$'+String(seqs[i].sequenceID)]=true;names['$'+String(seqs[i].name).toLowerCase()]=true;}
        var base=String(meta.name || 'Auto Sync Voice').replace(/[\x00-\x1f]/g,' ').slice(0,120), name=base, suffix=2;
        while(names['$'+name.toLowerCase()])name=base+' ('+(suffix++)+')';
        app.enableQE(); qe.project.newSequence(name,preset.fsName);
        seqs=app.project.sequences;
        for(i=0;i<seqs.numSequences;i++)if(!ids['$'+String(seqs[i].sequenceID)]){
            if(created)throw Error('Premiere tạo nhiều sequence ngoài dự kiến.'); created=seqs[i];
        }
        if(!created)throw Error('Premiere chưa tạo sequence từ preset.');
        app.project.openSequence(created.sequenceID);
        if(!app.project.activeSequence || String(app.project.activeSequence.sequenceID)!==String(created.sequenceID))throw Error('Không mở được sequence mới.');
        if(Math.abs(Number(created.timebase)-ASV_TICKS/meta.fps)>1)throw Error('FPS preset không khớp kế hoạch.');
        if(created.videoTracks.numTracks<1 || created.audioTracks.numTracks<1)throw Error('Sequence cần V1 và A1.');
        if(meta.captionPath && typeof created.createCaptionTrack!=='function')throw Error('Premiere này không hỗ trợ tạo Caption Track qua CEP. Cập nhật Premiere hoặc tắt tùy chọn Caption Track rồi import SRT thủ công: '+meta.captionPath);
        var groups=[created.videoTracks,created.audioTracks];
        for(var g=0;g<groups.length;g++)for(var t=0;t<groups[g].numTracks;t++){
            if(groups[g][t].clips.numItems || groups[g][t].isLocked())throw Error('Sequence mới phải trống và không khóa track.');
        }
        var bin=app.project.rootItem.createBin('Auto Sync Voice - '+name+' - '+new Date().getTime());
        if(!bin)throw Error('Không tạo được bin media.');
        var st={token:String(new Date().getTime())+'-'+String(Math.random()).slice(2),project:asvProjectID(),seq:created,
            timebase:String(created.timebase),meta:meta,bin:bin,next:0,total:meta.clipCount+1+(meta.captionPath?1:0),cursor:0,items:{},pending:null,
            finished:false,failed:false,warnings:[],fitted:{},preload:null,batch:null,
            stats:{importMs:0,insertMs:0,trimMs:0,motionMs:0,validationMs:0,captionMs:0,importCalls:0,clipReads:0,fullAudits:0}};
        st.snapshot=asvSnapshot(created);
        if(meta.turbo)asvLedgerInit(st);
        $.global.asvState=st;
        return asvStatus(st,false);
    }catch(e){ return asvError(String(e.message||e)+(created?' Sequence mới đang dở: '+created.name+'.':'')); }
}
function asvTrim(clip, startFrame, endFrame, timebase) {
    var frame=Number(timebase), source=asvTime(0), finish=asvTime(endFrame*frame);
    try { clip.inPoint=source; } catch(e) {}
    try { clip.end=finish; } catch(e2) {}
}
// Native keyframe presets adapted from SyncVideo-Audio (MIT), commit dc77cfb6.
// Premiere Position uses top-left normalized coordinates; CapCut Y points up.
function asvMotionValues(preset, scale, center) {
    var z=1.08, overscan=1.06, pan=0.025, a=scale, b=scale, p0=null, p1=null;
    if(preset==='zoom_in')b=scale*z;
    else if(preset==='zoom_out')a=scale*z;
    else {
        if(!center || center.length!==2 || typeof center[0]!=='number' || typeof center[1]!=='number' || !isFinite(center[0]+center[1]) || Math.abs(center[0]-0.5)>0.001 || Math.abs(center[1]-0.5)>0.001)throw Error('Position không ở tâm chuẩn [0.5, 0.5]; không tự đoán hệ tọa độ.');
        p0=[center[0],center[1]];p1=[center[0],center[1]];a=b=scale*overscan;
        if(preset==='pan_left_right'){p0[0]-=pan;p1[0]+=pan;}
        else if(preset==='pan_right_left'){p0[0]+=pan;p1[0]-=pan;}
        else if(preset==='pan_top_bottom'){p0[1]-=pan;p1[1]+=pan;}
        else if(preset==='pan_bottom_top'){p0[1]+=pan;p1[1]-=pan;}
        else throw Error('Kiểu chuyển động không hợp lệ: '+preset);
    }
    return {scale:[a,b],position:p0?[p0,p1]:null};
}
function asvMotionResult(value, action) {
    if(value===false || (typeof value==='number' && value!==0))throw Error('Premiere từ chối '+action+'.');
}
function asvMotionEqual(a,b) {
    if(typeof b==='number')return typeof a==='number' && isFinite(a) && Math.abs(a-b)<0.0001;
    return a && a.length===b.length && asvMotionEqual(a[0],b[0]) && asvMotionEqual(a[1],b[1]);
}
function asvMotionKeys(prop,start,end,values,quiet,refresh) {
    asvMotionResult(prop.setTimeVarying(true),'bật keyframe');
    asvMotionResult(prop.addKey(start),'thêm keyframe đầu');
    asvMotionResult(prop.addKey(end),'thêm keyframe cuối');
    asvMotionResult(prop.setValueAtKey(start,values[0],!quiet),'ghi giá trị đầu');
    asvMotionResult(prop.setValueAtKey(end,values[1],!quiet),'ghi giá trị cuối');
    // 0 = linear, matching the upstream editable native draft (not MP4 easing).
    asvMotionResult(prop.setInterpolationTypeAtKey(start,0,!quiet),'nội suy đầu');
    asvMotionResult(prop.setInterpolationTypeAtKey(end,0,!quiet || refresh),'nội suy cuối');
    if(!asvMotionEqual(prop.getValueAtKey(start),values[0]) || !asvMotionEqual(prop.getValueAtKey(end),values[1]))throw Error('Đọc lại keyframe không khớp giá trị đã đặt.');
}
function asvStyle(st,clip,row) {return asvMeasure(st,'motionMs',function(){return asvStyleImpl(st,clip,row);});}
function asvStyleImpl(st, clip, row) {
    var preset=row.motion || (st.meta.zoom && row.kind==='image'?'zoom_in':'none');
    if(preset==='none' || (row.kind!=='image' && row.kind!=='video') || row.endFrame-row.startFrame<2)return;
    var touched=[],uniform=null,oldUniform,uniformTouched=false,start,end;
    try {
        var motion=null,i;
        for(i=0;i<clip.components.numItems;i++)if(String(clip.components[i].matchName)==='AE.ADBE Motion')motion=clip.components[i];
        if(!motion)throw Error('Không đọc được Motion.');
        var scale=motion.properties[1],position=motion.properties[0];uniform=motion.properties[3];
        var scaleValue=scale.getValue();
        if(typeof scaleValue!=='number' || !isFinite(scaleValue) || scaleValue<=0)throw Error('Scale không hợp lệ.');
        var pan=preset.indexOf('pan_')===0,center=pan?position.getValue():null;
        var values=asvMotionValues(preset,scaleValue,center),props=[{prop:scale,old:scaleValue,values:values.scale}];
        if(values.position)props.push({prop:position,old:[center[0],center[1]],values:values.position});
        var methods=['setTimeVarying','isTimeVarying','addKey','removeKey','setValueAtKey','getValueAtKey','setInterpolationTypeAtKey','setValue'];
        for(i=0;i<props.length;i++){
            var prop=props[i].prop;
            for(var m=0;m<methods.length;m++)if(typeof prop[methods[m]]!=='function')throw Error('Premiere thiếu API '+methods[m]+'.');
            if((typeof prop.areKeyframesSupported==='function' && !prop.areKeyframesSupported()) || prop.isTimeVarying())throw Error('Motion không hỗ trợ keyframe mới hoặc đã có chuyển động.');
        }
        oldUniform=uniform.getValue();uniformTouched=true;
        asvMotionResult(uniform.setValue(true,!st.meta.turbo),'bật Uniform Scale');
        start=asvTime(Number(clip.inPoint.ticks));
        end=asvTime(Number(clip.inPoint.ticks)+(row.endFrame-row.startFrame-1)*Number(st.timebase));
        for(i=0;i<props.length;i++){touched.push(props[i]);asvMotionKeys(props[i].prop,start,end,props[i].values,!!st.meta.turbo,i===props.length-1);}
    }catch(e){
        var rollback=[];
        for(var r=touched.length-1;r>=0;r--){
            try {
                touched[r].prop.removeKey(start);touched[r].prop.removeKey(end);
                asvMotionResult(touched[r].prop.setTimeVarying(false),'tắt keyframe khi khôi phục');
                asvMotionResult(touched[r].prop.setValue(touched[r].old,true),'khôi phục Motion');
            }catch(resetError){rollback.push(String(resetError.message||resetError));}
        }
        if(uniformTouched){try{asvMotionResult(uniform.setValue(oldUniform,true),'khôi phục Uniform Scale');}catch(resetUniform){rollback.push(String(resetUniform.message||resetUniform));}}
        st.warnings.push('Cảnh '+row.sceneIndex+' ('+preset+'): không thêm được chuyển động ('+String(e.message||e)+').'+(rollback.length?' Kiểm tra Motion thủ công: '+rollback.join('; '):''));
    }
}
function asvCaptionStep(st, index) {
    // SRT is imported once, after visuals and narration are complete.
    // Native caption DOM/style introspection is not assumed to be available.
    asvValidate(st,true);
    if(st.meta.turbo)asvLedgerCheck(st,null,true);
    var file=new File(st.meta.captionPath), p=st.pending, i;
    if(!file.exists)throw Error('File SRT không còn tồn tại: '+st.meta.captionPath);
    if(!p){
        var before={};
        for(i=0;i<st.bin.children.numItems;i++)before['$'+st.bin.children[i].nodeId]=true;
        st.pending={phase:'captionImport',index:index,attempts:0,before:before};
        if(!asvImport(st,[file.fsName]))throw Error('Không import được SRT: '+st.meta.captionPath);
        return asvStatus(st,true);
    }
    if(p.index!==index || p.phase!=='captionImport')throw Error('Đã gọi tạo Caption Track; không tự gọi lại để tránh trùng track.');
    var item=asvFind(st.bin,st.meta.captionPath);
    if(!item){
        // Some hosts do not expose a media path for imported caption items.
        var name=String(st.meta.captionPath).replace(/\\/g,'/').split('/').pop(), candidates=[];
        for(i=0;i<st.bin.children.numItems;i++){
            var candidate=st.bin.children[i];
            if(!p.before['$'+candidate.nodeId] && String(candidate.name)===name)candidates.push(candidate);
        }
        if(candidates.length>1)throw Error('Có nhiều SRT mới trùng tên trong bin. Đã dừng.');
        if(candidates.length===1)item=candidates[0];
    }
    if(!item){if(++p.attempts<80)return asvStatus(st,true);throw Error('Premiere chưa xác nhận SRT vừa import: '+st.meta.captionPath);}
    // Official Adobe PProPanel pattern: imported project item + offset in seconds.
    // Omitting the optional format uses a Subtitle track for SRT.
    p.phase='captionCreating';
    var result=asvMeasure(st,'captionMs',function(){return st.seq.createCaptionTrack(item,0);});
    if(result!==true)throw Error('Premiere chưa xác nhận tạo Caption Track. Không tự thử lại; kiểm tra timeline và SRT: '+st.meta.captionPath);
    asvValidate(st,true);
    if(st.meta.turbo)asvLedgerCheck(st,null,true);
    st.next++;st.pending=null;st.finished=true;
    st.lastResult=asvStatus(st,false);return st.lastResult;
}
function asvStep(token,index,row) {
    var st=$.global.asvState;
    try {
        if(!st || st.token!==token)throw Error('Phiên dựng không còn hiệu lực.');
        if(index===st.next-1 && st.lastResult){asvValidate(st,true,true);return st.lastResult;}
        asvValidate(st,false);
        if(index!==st.next)throw Error('Sai thứ tự dựng; không tự chèn lại.');
        if(index===st.meta.clipCount+1 && st.meta.captionPath)return asvCaptionStep(st,index);
        if(index>st.meta.clipCount)throw Error('Sai bước dựng.');
        var audio=index===st.meta.clipCount;
        if(audio)row={path:st.meta.audio,kind:'audio',startFrame:0,endFrame:st.meta.totalFrames,sceneIndex:0};
        if(!row || !new File(row.path).exists)throw Error('Media không tồn tại.');
        if(!audio && (row.kind!=='image' && row.kind!=='video'))throw Error('Loại clip không hợp lệ.');
        if(!audio && (!isFinite(row.startFrame) || !isFinite(row.endFrame) || Math.floor(row.startFrame)!==row.startFrame || Math.floor(row.endFrame)!==row.endFrame || row.endFrame<=row.startFrame || row.endFrame>st.meta.totalFrames))throw Error('Mốc clip không hợp lệ.');
        if(!audio && row.startFrame!==st.cursor)throw Error('Timeline có khoảng trống.');
        if(audio && st.cursor!==st.meta.totalFrames)throw Error('Hình chưa phủ đủ voice.');
        if(st.preload)throw Error('Lô media chưa được xác nhận import.');
        var seq=st.seq, track=audio?seq.audioTracks[0]:seq.videoTracks[0], p=st.pending;
        if(!p){
            asvValidate(st,true);
            if(st.meta.turbo && audio)asvLedgerCheck(st,null,true);
            var pathKey='$'+asvPath(row.path), item=st.items[pathKey];
            if(!item && st.meta.turbo && !audio)throw Error('Media chưa được chuẩn bị trong lô: '+row.path);
            if(!item && !asvImport(st,[new File(row.path).fsName]))throw Error('Không import được '+row.path);
            st.pending={phase:'imported',row:row,key:pathKey,attempts:0,index:index};
            return asvStatus(st,true);
        }
        if(p.index!==index || asvJSON(p.row)!==asvJSON(row))throw Error('Kế hoạch clip thay đổi giữa chừng.');
        if(p.phase==='imported'){
            asvValidate(st,true);
            var media=st.items[p.key] || asvFind(st.bin,row.path);
            if(!media){if(++p.attempts<80)return asvStatus(st,true);throw Error('Premiere chưa xác nhận media vừa import.');}
            if(typeof media.isOffline==='function' && media.isOffline())throw Error('Media offline: '+row.path);
            st.items[p.key]=media;
            if(!audio && st.meta.fit && (!st.meta.turbo || !st.fitted[p.key])){
                if(typeof media.setScaleToFrameSize!=='function')throw Error('Premiere không hỗ trợ Scale to Frame Size.');
                media.setScaleToFrameSize();st.fitted[p.key]=true;
            }
            p.itemID=String(media.nodeId);p.previous=Number(track.clips.numItems);p.attempts=0;
            p.phase='placed';
            // Track API uses numeric seconds. Do not use insertClip (would ripple).
            asvMeasure(st,'insertMs',function(){track.overwriteClip(media,row.startFrame*Number(st.timebase)/ASV_TICKS);});
            return asvStatus(st,true);
        }
        track=audio?seq.audioTracks[0]:seq.videoTracks[0];
        var added=null;
        // This builder appends chronologically; check the newest clip first.
        for(var j=track.clips.numItems-1;j>=0;j--){
            var c=track.clips[j];
            if(String(c.projectItem.nodeId)===p.itemID && Math.abs(Number(c.start.ticks)-row.startFrame*Number(st.timebase))<Number(st.timebase)/2){added=c;break;}
        }
        if(!added){if(++p.attempts<80)return asvStatus(st,true);throw Error('Premiere chưa xác nhận clip trên timeline.');}
        if(track.clips.numItems!==p.previous+1)throw Error('Số clip thay đổi ngoài dự kiến.');
        if(p.phase==='placed'){
            // Voice is inserted LAST. At this stage any audio is linked to source video.
            if(!audio){
                for(var a=0;a<seq.audioTracks.numTracks;a++)for(var n=seq.audioTracks[a].clips.numItems-1;n>=0;n--){
                    var linked=seq.audioTracks[a].clips[n];
                    if(String(linked.projectItem.nodeId)===p.itemID && Math.abs(Number(linked.start.ticks)-row.startFrame*Number(st.timebase))<Number(st.timebase)/2)linked.remove(false,false);
                }
            }
            asvCheckExisting(st,added,null);
            asvMeasure(st,'trimMs',function(){asvTrim(added,row.startFrame,row.endFrame,st.timebase);});
            p.phase='trimmed';p.attempts=0;
            return asvStatus(st,true);
        }
        var targetEnd=audio?st.meta.duration*ASV_TICKS:row.endFrame*Number(st.timebase);
        // Audio can end fractionally before the last video frame; never fabricate samples.
        if(audio){try{added.end=asvTime(targetEnd);}catch(e){} }
        if(Math.abs(Number(added.start.ticks)-row.startFrame*Number(st.timebase))>Number(st.timebase)/2 ||
           Math.abs(Number(added.end.ticks)-targetEnd)>Number(st.timebase)/2 || Math.abs(Number(added.inPoint.ticks))>Number(st.timebase)/2){
            if(++p.attempts<5){asvMeasure(st,'trimMs',function(){asvTrim(added,row.startFrame,row.endFrame,st.timebase);});return asvStatus(st,true);}
            throw Error('Không đặt đúng In/Out/thời lượng clip: '+row.path);
        }
        var verified={};
        asvCheckExisting(st,added,verified);
        asvStyle(st,added,row);
        st.next++;if(!audio)st.cursor=row.endFrame;
        // Motion only changes effect parameters, which are outside this geometry snapshot.
        if(st.meta.turbo)asvLedgerCommit(st,added,audio);
        st.pending=null;if(!st.meta.turbo)st.snapshot=verified.snapshot;
        if(audio && st.meta.turbo)asvLedgerCheck(st,null,true);
        if(audio && !st.meta.captionPath){st.finished=true;}
        st.lastResult=asvStatus(st,false);return st.lastResult;
    }catch(e){
        if(st && st.token===token){st.failed=true;st.finished=true;}
        return asvError(String(e.message||e)+' Sequence đang dở được giữ lại để kiểm tra.');
    }
}
// Run only immediately available phases of ONE clip in one CEP round trip.
// A stable pending phase means Premiere needs time: return to the panel to poll.
// No busy-wait and no retry of a mutating import/overwrite/caption operation.
function asvAdvance(token,index,row) {
    var deadline=new Date().getTime()+80, result, count=0;
    do {
        var st=$.global.asvState;
        var phase=st && st.pending?st.pending.phase:'';
        result=asvStep(token,index,row);
        st=$.global.asvState;
        if(!st || st.token!==token || st.failed || st.finished || st.next!==index)return result;
        var nextPhase=st.pending?st.pending.phase:'';
        if(nextPhase===phase)return result;
        count++;
    }while(count<4 && new Date().getTime()<deadline);
    return result;
}
function asvMetrics(token) {
    var st=$.global.asvState;
    if(!st || st.token!==token)return asvError('Phiên dựng không còn hiệu lực.');
    return asvJSON({ok:true,stats:st.stats,done:st.next,total:st.total,failed:!!st.failed});
}
function asvStop(token) {
    var st=$.global.asvState;
    if(st && (!token || st.token===token)){st.finished=true;st.pending=null;st.preload=null;st.batch=null;}
    return asvJSON({ok:true,message:'Đã dừng. Giữ sequence đang dở để kiểm tra.'});
}
