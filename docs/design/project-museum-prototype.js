const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const projects={museum:{name:'DigitalMuseum',path:'/Users/demo/Projects/DigitalMuseum',art:'gathered-pages-v2'},agent:{name:'Agent Memory',path:'/Users/demo/Projects/agent-memory',art:'everyday-steps'},'archive-main':{name:'Local Archive',path:'/Users/demo/Projects/local-archive',art:'continuous-light'},'archive-lab':{name:'Local Archive',path:'/Users/demo/Experiments/local-archive',art:'paper-study'},toolkit:{name:'Builder Toolkit',path:'/Users/demo/Projects/builder-toolkit',art:'bridge-study'}};
const sourceNames={claude:'Claude Code',codex:'Codex'},types=['做出选择','放弃方案','约束条件','进展变化','决定变更'];
const num=v=>Number.isInteger(v)&&v>=0&&v<=10000?v:0;
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v));
function defaultAnchors(){return MuseumDemo.topics.map((_,i)=>{const source=i===2||i===4?'codex':'claude';let n=1;while(MuseumDemo.topicIndex(`demo-${source}-${n}`)!==i)n++;return {id:`demo-${source}-${n}`,source,date:['2026-07-02','2026-07-20','2026-08-18','2026-09-20','2026-09-24'][i]}})}
function defaultContext(){
 const ctx={project:'museum',from:'direct',mode:'initial',counts:{claude:32,codex:20},range:{start:'2026-07-02',end:'2026-09-24'},gaps:{failed:2,skipped:1,outside:0,unknown:0},anchors:defaultAnchors(),origin:''};
 const catalog=[...ctx.anchors];for(const key of Object.keys(sourceNames)){const wanted=ctx.counts[key],start=Date.parse((key==='claude'?'2026-07-02':'2026-08-03')+'T00:00:00Z'),end=Date.parse((key==='claude'?'2026-09-20':'2026-09-24')+'T00:00:00Z');let index=1;while(catalog.filter(x=>x.source===key).length<wanted){const id=`demo-${key}-${index}`;if(!catalog.some(x=>x.id===id))catalog.push({id,source:key,date:new Date(start+(end-start)*Math.min(index/wanted,1)).toISOString().slice(0,10)});index++;}}
 ctx.sessions=catalog;return ctx;
}
function cleanSessions(list,counts,range,max=60){return (Array.isArray(list)?list:[]).slice(0,max).filter(a=>a&&typeof a.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(a.id)&&Object.hasOwn(sourceNames,a.source)&&counts[a.source]>0&&date(a.date)&&a.date>=range.start&&a.date<=range.end).map(a=>({id:a.id,source:a.source,date:a.date})).filter((a,i,all)=>all.findIndex(x=>x.id===a.id)===i);}
function readContext(){
 const raw=params.get('context');if(!raw){if(params.has('resume')){const id=params.get('project');if(!Object.hasOwn(projects,id))return null;const saved=MuseumStore.list(projects[id].path).versions.at(-1)?.snapshot.context;return saved?.project===id?saved:null;}return defaultContext();}
 try{if(raw.length>24000)return null;const c=JSON.parse(raw);if(typeof c.project!=='string'||!Object.hasOwn(projects,c.project)||!['f03','f04'].includes(c.from)||!date(c.range?.start)||!date(c.range?.end)||c.range.start>c.range.end)return null;
 const counts={claude:num(c.counts?.claude),codex:num(c.counts?.codex)},gaps={failed:num(c.gaps?.failed),skipped:num(c.gaps?.skipped),outside:num(c.gaps?.outside),unknown:num(c.gaps?.unknown)};
 const anchors=cleanSessions(c.anchors,counts,c.range,5),sessions=cleanSessions(c.sessions,counts,c.range);
 return {project:c.project,from:c.from,mode:c.from==='f04'?'update':'initial',counts,range:c.range,gaps,anchors,sessions:sessions.length?sessions:anchors,materialCounts:c.materialCounts?{claude:num(c.materialCounts.claude),codex:num(c.materialCounts.codex)}:counts,origin:typeof c.origin==='string'?c.origin.slice(0,9000):''};
 }catch{return null;}
}
const context=readContext(),project=context?projects[context.project]:null;
const total=()=>scenario==='no-material'?0:context.counts.claude+context.counts.codex;
const gapText=g=>`${g.failed} 条读取失败、${g.skipped} 条跳过、${g.outside} 条未在本次范围；${g.unknown} 项其他未读或来源缺口`;
let scenario='normal',connection='unconfigured',validationAttempts=0,generationAttempts=0,timer=null,running=false,stage=0,result=null,filter='全部',runState='idle';
let dirty=false,userDirty=false,currentVersionId=null,versionState={available:true,versions:[],corrupt:0},showIgnored=false,sourceOffline=false,selectedSessionId=null,evidenceEvent=null,editingId=null,pendingAction=null,clearScope='project';
const reviewLabels={pending:'待核对',confirmed:'本人确认',ignored:'已忽略'},appLabels={unknown:'待核对',active:'本人确认仍适用',inactive:'已不适用',replaced:'被另一决定替代'};
const savedFixture=$('saved-content').cloneNode(true);
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const set=(id,text)=>$(id).textContent=text;
function renderForm(){if(!context)return;
 const inputCount=total(),loaded=!!$('endpoint').value&&!!$('credential').value,modelOK=$('model').value.trim().length>0,validating=connection==='checking',busy=running||validating;
 $('validate-config').disabled=!loaded||!modelOK||busy;$('load-config').disabled=busy;$('model').disabled=busy;$('consent').disabled=busy;$('scenario').disabled=busy;
 const configLabels={unconfigured:'尚未配置模型。项目材料仍只在原型中展示。',idle:'已加载虚构接口与凭证，请验证演示配置。',checking:'正在验证演示配置，没有发起真实请求。',ready:'演示配置可用。还需确认项目与材料范围，才会开始生成。',error:'模拟验证失败：接口暂不可用。可再次验证，已读材料保持不变。'};set('config-status',configLabels[connection]);$('config-status').dataset.error=String(connection==='error');
 set('scope-count',`${inputCount} ${context.mode==='update'?'项已读变化及相关旧依据':'条已读会话'}`);set('scope-sources',Object.keys(sourceNames).filter(k=>context.counts[k]).map(k=>`${sourceNames[k]} · ${context.counts[k]}`).join(' / ')||'没有可用来源');
 set('scope-note',!inputCount?'没有已读材料，无法生成。请先返回读取步骤。':inputCount>60?'超出本轮原型单次 60 条的演示上限。请返回读取步骤主动缩小范围，未纳入材料会继续标明。':context.mode==='update'?'只为本次变化生成新的候选更新。已保存版本与手动修订继续保留。':'候选回顾只覆盖已读材料。未读缺口不会被补写成事实。');
 $('generate').disabled=!project||busy||connection!=='ready'||!$('consent').checked||!inputCount||inputCount>60;
 set('generate',runState==='error'?'重试生成（模拟）':result?'再次生成候选（模拟）':'开始生成（模拟）');$('cancel-generation').hidden=!running;$('progress-wrap').hidden=!running;
 set('generation-state',running?'生成中':runState==='error'?'生成失败':runState==='canceled'?'已取消':result?currentVersionId&&!dirty?'已打开保存版本':'候选已生成':connection==='ready'?'等待主动生成':'等待配置');
 set('generator-title',result?'生成配置与再次生成':'生成项目回顾');renderWorkspace();
}
function showGenerationMessage(text){set('generation-message',text);$('generation-message').hidden=false;}
function validate(){if(running||connection==='checking')return;connection='checking';validationAttempts++;$('consent').checked=false;renderForm();timer=setTimeout(()=>{timer=null;connection=scenario==='connection-failed'&&validationAttempts===1?'error':'ready';renderForm()},450);}
function generate(){if($('generate').disabled||running)return;running=true;runState='running';generationAttempts++;stage=0;$('generation-message').hidden=true;
 const snapshot={model:$('model').value.trim(),scenario,count:total(),generatedAt:new Date().toLocaleString('zh-CN',{hour12:false})};
 const steps=['整理所选材料','提取候选变化','对齐原因、范围与出处','形成可核对的草稿'];set('progress-label',steps[0]);$('generation-progress').value=0;renderForm();
 timer=setInterval(()=>{stage++;$('generation-progress').value=stage;set('progress-label',steps[Math.min(stage,3)]);
  if(stage===3&&scenario==='generation-failed'&&generationAttempts===1){clearInterval(timer);timer=null;running=false;runState='error';showGenerationMessage('模拟生成失败，未产生新候选。已有回顾与已确认样例仍保留；可主动重试。');renderForm();return;}
  if(stage>=4){clearInterval(timer);timer=null;running=false;runState='success';result=newResult({...snapshot,events:snapshot.scenario==='insufficient'?[]:MuseumDemo.events(context.anchors)});dirty=true;userDirty=false;currentVersionId=null;filter='全部';renderResult();renderForm();$('generator').open=false;$('museum').scrollIntoView({behavior:'auto',block:'start'});}
 },380);
}
function cancel(){if(!running)return;clearInterval(timer);timer=null;running=false;runState='canceled';showGenerationMessage('本次生成已取消。已有回顾与已确认样例保持可读，尚未产生新候选。');renderForm();$('generate').focus({preventScroll:true});}
function sourceButton(event,label='查看相关记录 ↓'){if(!event)return null;const b=node('button','inline-source',label);b.type='button';b.addEventListener('click',()=>jumpEvent(event.id));return b;}
function activeEvents(){return result?result.events.filter(e=>e.review!=='ignored'):[];}
function renderResult(){if(!result)return;const reportContext=result.context||context;$('waiting').hidden=true;$('museum').hidden=false;$('saved-banner').hidden=reportContext.mode!=='update';set('result-version',reportContext.mode==='update'?'候选 v2 · 待核对':'候选回顾 · 待核对');
 $('coverage').replaceChildren(node('strong','',`本次回顾基于 ${result.count} ${reportContext.mode==='update'?'项已读变化与相关旧依据':'条已读会话'}。`),document.createTextNode(' '+gapText(reportContext.gaps)+'。'),node('small','',`演示模型：${result.model} · 本次生成：${result.generatedAt} · 所有摘要和引文均为合成样例`));
 set('asof',`记录截至 ${reportContext.range.end}\n只反映已读记录中的状态`);$('asof').style.whiteSpace='pre-line';
 const decision=activeEvents().find(e=>e.topic===1),progress=activeEvents().find(e=>e.topic===3),constraint=activeEvents().find(e=>e.topic===0);
 const cards=[['记录中的目标',decision?decision.title:'当前目标尚无法确定',decision?decision.reason+' 范围：'+decision.scope:'已读材料未给出足够明确的目标说明，待你补充核对。',decision],['进展与依据',progress?progress.title:'验证状态尚不明确',progress?progress.reason:'未找到足够材料判断实现、测试与验收进度。',progress],['尚未解决的问题',progress?'验证依据是否已补齐？':'哪些记录仍然缺失？',progress?'当前材料没有后续测试或验收依据；不能据此认定功能不可用或已经通过。':'需要先补足材料，再判断项目的当前进展。',progress||constraint]];
 $('overview-grid').replaceChildren();for(const [label,title,text,event]of cards){const card=node('article','overview-card');card.append(node('span','',label),node('h3','',title),node('p','',text));if(label==='进展与依据'){const tags=node('div','progress-tags');tags.append(node('span','',progress?'实现：Agent 表述':'实现：待核对'),node('span','','原始记录：未附测试结果'),node('span','','产品验收：未核实'));card.append(tags)}const b=sourceButton(event);if(b)card.append(b);$('overview-grid').append(card)}
 renderTimeline();renderBefore();renderWorkspace();
}
function renderTimeline(){if(!result)return;
 const active=activeEvents(),ignored=result.events.filter(e=>e.review==='ignored'),pool=showIgnored?result.events:active;
 set('timeline-count',`${active.length} 个展示节点 · ${ignored.length} 个已忽略`);set('review-summary',`${active.filter(e=>e.review==='confirmed').length} / ${active.length} 个展示节点已由本人确认；适用状态单独记录。`);
 $('filters').replaceChildren();for(const type of ['全部',...types]){const count=type==='全部'?pool.length:pool.filter(e=>e.type===type).length,b=node('button','',`${type} ${count}`);b.type='button';b.setAttribute('aria-pressed',String(filter===type));b.addEventListener('click',()=>{filter=type;renderTimeline();$('filters').querySelector('[aria-pressed=true]')?.focus({preventScroll:true})});$('filters').append(b)}
 const events=pool.filter(e=>filter==='全部'||e.type===filter);$('timeline').replaceChildren();$('timeline-empty').hidden=!!events.length;
 if(!events.length)$('timeline-empty').replaceChildren(node('strong','',result.events.length?'没有可展示的匹配节点':'材料不足，暂不形成时间线'),document.createTextNode(ignored.length?'已忽略的节点仍可从“显示已忽略节点”中恢复。':'切换类型或补充材料后再核对；没有节点不表示没有历史。'));
 for(const e of events){const article=node('article','event');article.id=e.id;article.tabIndex=-1;article.dataset.type=e.type;article.dataset.review=e.review;const card=node('div','event-card'),top=node('div','event-top'),time=node('time','',e.date);time.dateTime=e.date;top.append(node('span','event-type',e.type),time);if(e.editedAt)top.append(node('span','manual-tag','本人修改过'));card.append(top,node('h3','',e.title));const dl=node('dl');dl.append(node('dt','','原因'),node('dd','',e.reason),node('dt','','范围'),node('dd','',e.scope));card.append(dl);
 const tags=node('div','truth-tags');tags.append(node('span','','整理认可：'+reviewLabels[e.review]),node('span','','当前适用：'+appLabels[e.applicability]));card.append(tags);
 const target=e.applicability==='replaced'?result.events.find(x=>x.id===e.replacedBy):e.topic===4?active.find(x=>x.topic===1&&x.date<=e.date):null;
 if(target){const relation=node('div','relation-note');relation.append(node('p','',e.applicability==='replaced'?'你已指定替代关系；原节点与依据继续保留。':'原文提到调整读取方案，跨范围的当前适用性仍待核对。'));const b=node('button','relation',(e.applicability==='replaced'?'替代决定：':'候选关联：')+target.title+' ↗');b.type='button';b.addEventListener('click',()=>jumpEvent(target.id));relation.append(b);card.append(relation)}
 const evidence=node('div','evidence-row');evidence.append(node('small','',`${sourceNames[e.anchor.source]} · ${e.anchor.date} · ${e.anchor.id}`));const b=node('button','','查看原话与上下文 ↗');b.type='button';b.setAttribute('aria-label','查看依据：'+e.title);b.addEventListener('click',()=>openEvidence(e));evidence.append(b);card.append(evidence);
 const actions=node('div','event-actions');for(const [action,label] of e.review==='ignored'?[['restore','恢复节点']]:[['confirm',e.review==='confirmed'?'已本人确认':'符合我的理解'],['edit','修改'],['ignore','忽略']]){const button=node('button','',label);button.type='button';button.dataset.action=action;button.setAttribute('aria-label',label+'：'+e.title);button.disabled=running||(action==='confirm'&&e.review==='confirmed');button.addEventListener('click',()=>reviewEvent(e.id,action));actions.append(button)}card.append(actions);article.append(card);$('timeline').append(article);
 }
}
function jumpEvent(id){const e=result?.events.find(x=>x.id===id);if(e?.review==='ignored'){showIgnored=true;$('show-ignored').checked=true;}filter='全部';renderTimeline();const target=$(id);if(target){target.scrollIntoView({behavior:'auto',block:'start'});target.focus({preventScroll:true});}}
function renderBefore(){const event=topic=>activeEvents().find(e=>e.topic===topic);const rules=[['记录中的约束',event(0)],['明确放弃的方案',event(2)],['继续前注意范围',event(4)],['仍待解决的问题',event(3)]];$('before-grid').replaceChildren();
 for(const [label,e]of rules){const card=node('article','before-card');let description=e?e.reason+' 适用范围：'+e.scope:'没有可展示且依据充分的记录，继续保留待核对。';if(e?.applicability==='inactive')description='你已标记为不再适用。'+description;if(e?.applicability==='replaced')description='你已标记为被另一决定替代。'+description;card.append(node('span','',label),node('h3','',e?e.title:'本次材料不足以判断'),node('p','',description),node('small','',e?`最近引用：${e.date} · ${reviewLabels[e.review]} · 当前适用：${appLabels[e.applicability]}`:'依据与适用状态：待核对'));if(e){const b=node('button','','回到对应记录 ↑');b.type='button';b.setAttribute('aria-label','回到记录：'+label);b.addEventListener('click',()=>jumpEvent(e.id));card.append(b)}$('before-grid').append(card)}
}
function appendMessages(parent,anchor){for(const m of MuseumDemo.messages(anchor)){const box=node('div','message');box.dataset.role=m.role;box.append(node('strong','',m.label),node('p','',m.text));parent.append(box)}}
function openEvidence(e){openSessions(e);}
$('load-config').addEventListener('click',()=>{$('endpoint').value='https://model.example.invalid/v1';$('model').value='museum-demo';$('credential').value='demo-not-a-real-key';connection='idle';validationAttempts=0;$('consent').checked=false;renderForm()});
$('model').addEventListener('input',()=>{connection=$('endpoint').value?'idle':'unconfigured';$('consent').checked=false;renderForm()});$('validate-config').addEventListener('click',validate);$('consent').addEventListener('change',renderForm);$('generate').addEventListener('click',()=>guardUnsaved(generate));$('cancel-generation').addEventListener('click',cancel);
$('scenario').addEventListener('change',()=>{scenario=$('scenario').value;generationAttempts=0;validationAttempts=0;runState='idle';$('consent').checked=false;if(scenario==='connection-failed')connection=$('endpoint').value?'idle':'unconfigured';$('generator').open=true;$('generation-message').hidden=true;renderForm()});
$('preview-material').addEventListener('click',()=>{set('payload-target',`接收服务：${$('endpoint').value||'尚未配置'} · 模型：${$('model').value||'尚未配置'}（均为演示）`);set('payload-scope',`项目：${project.name} · ${total()} ${context.mode==='update'?'项已读变化与相关旧依据':'条已读会话'} · ${context.range.start} — ${context.range.end}`);$('material-preview').replaceChildren();if(context.anchors.length&&total()>0)appendMessages($('material-preview'),context.anchors[0]);else $('material-preview').append(node('p','','尚无可预览的已读材料。'));$('material-dialog').showModal()});
$('view-saved').addEventListener('click',openSaved);$('view-saved-before').addEventListener('click',openSaved);$('reopen-generator').addEventListener('click',()=>$('generator').open=true);document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));window.addEventListener('pagehide',()=>{clearTimeout(timer);clearInterval(timer)});
if(!project){$('invalid').hidden=false;$('generator').hidden=true;$('waiting').hidden=true;document.querySelector('.banner').hidden=true;document.querySelector('.review-tools').hidden=true;}else{
 set('project-name',project.name);set('project-path',project.path);$('project-art').src='../../public/gallery/'+project.art+'.png';set('scope-project',project.name+' · '+project.path);set('scope-range',`${context.range.start} — ${context.range.end}`);set('scope-gaps',gapText(context.gaps));
 if(context.mode==='update'){$('view-saved-before').hidden=false;set('project-intro','为新材料生成候选更新，同时保留已保存版本和本人修订。');set('send-content','已成功读取的变化正文、必要角色与时间、与这些变化相关的旧依据片段。');}
 if(context.from!=='direct'){$('back-link').href=(context.from==='f04'?'f04-update-records-prototype.html':'f03-read-history-prototype.html')+'?'+context.origin;$('back-link').textContent=context.from==='f04'?'← 返回检查更新':'← 返回读取历史';}
 const origin=new URLSearchParams(context.origin),readOrigin=context.from==='f04'?new URLSearchParams(origin.get('history')||''):origin,catalog=new URLSearchParams(readOrigin.get('catalog')||'');catalog.set('focus',context.project);$('projects-link').href='f02-project-list-prototype.html?'+catalog.toString();renderForm();
}

initializeWorkspace();

function copy(value){return JSON.parse(JSON.stringify(value));}
function captureMessages(session){return MuseumDemo.messages(session).map((m,i)=>({...m,index:i+1,at:session.date+' 09:'+String(i*2).padStart(2,'0')}));}
function newResult(report){
 const catalog=copy(context.sessions?.length?context.sessions:context.anchors),evidence=Object.create(null);
 for(const anchor of context.anchors)evidence[anchor.id]={session:copy(anchor),messages:captureMessages(anchor)};
 return {...report,context:copy(context),catalog,evidence,events:report.events.map(e=>({...e,review:'pending',applicability:'unknown',replacedBy:null,editedAt:null}))};
}
function refreshVersions(){if(project)versionState=MuseumStore.list(project.path);}
function renderWorkspace(){
 if(!project)return;
 const busy=running||connection==='checking',active=activeEvents(),confirmed=active.filter(e=>e.review==='confirmed').length;
 $('browse-sessions').disabled=busy;$('open-settings').disabled=busy;
 $('save-version').disabled=!result||busy||!dirty;$('check-updates').disabled=busy||!versionState.versions.length;
 const savedBanner=$('saved-banner');savedBanner.hidden=!(dirty&&versionState.versions.length)&&!(context.mode==='update'&&!versionState.versions.length);if(!savedBanner.hidden){savedBanner.firstElementChild.textContent=versionState.versions.length?`已有 ${versionState.versions.length} 个保存版本保留。当前内容尚未保存，可核对后创建新版本。`:'当前已保存样例与手动修订保留，新候选尚未替换它。';$('view-saved').textContent=versionState.versions.length?'查看最近保存版本':'查看已保存样例';}
 $('versions').disabled=busy||!versionState.versions.length;
 $('versions').replaceChildren();
 if(dirty||!currentVersionId)$('versions').append(new Option(result?'当前未保存内容':'尚无保存版本','draft'));
 versionState.versions.forEach((v,i)=>{$('versions').append(new Option(`v${i+1} · ${new Date(v.savedAt).toLocaleString('zh-CN',{hour12:false})}`,v.id));});
 $('versions').value=dirty||!currentVersionId?'draft':currentVersionId;
 const versionIndex=versionState.versions.findIndex(v=>v.id===currentVersionId);
 set('save-state',!result?'尚未生成回顾':dirty?userDirty?'有未保存的核对或修改':'新候选尚未保存':`已打开保存版本 v${versionIndex+1}`);
 set('save-detail',!result?'生成后可核对并保存。':`${confirmed} / ${active.length} 个展示节点已本人确认。保存不会自动确认其他节点，也不会确认当前适用性。`);
 set('result-version',`${confirmed}/${active.length} 本人确认 · ${dirty?'未保存':`保存版本 v${versionIndex+1}`}`);
 $('storage-warning').hidden=versionState.available&&!versionState.corrupt;
 if(!versionState.available)set('storage-warning','当前浏览器无法读取本地存储。页面内容仍可核对，保存前需要恢复本地存储访问。');
 else if(versionState.corrupt)set('storage-warning',`${versionState.corrupt} 个存档未通过格式检查，未自动覆盖或删除。其余可读版本仍保留。`);
 $('view-saved-before').hidden=!versionState.versions.length&&context.mode!=='update';
 $('view-saved-before').textContent=versionState.versions.length?'查看最近保存版本':'查看已确认版本样例';
 document.querySelectorAll('.event-actions button').forEach(b=>{b.disabled=busy||(b.dataset.action==='confirm'&&b.textContent==='已本人确认');});
}
function saveCurrent(){
 if(!result||running)return false;
 const fail=$('save-failure').checked;$('save-failure').checked=false;
 try{const record=MuseumStore.save(project.path,copy(result),fail);currentVersionId=record.id;dirty=false;userDirty=false;refreshVersions();renderWorkspace();set('save-state',`已保存为 v${versionState.versions.findIndex(v=>v.id===record.id)+1}`);set('save-detail','已写入当前浏览器本地。关闭后再次打开此项目，会先显示保存版本。');return true;}
 catch(error){set('save-state','保存失败 · 修改仍在页面中');set('save-detail',error.message);return false;}
}
function loadVersion(id){const record=versionState.versions.find(v=>v.id===id);if(!record)return;result=copy(record.snapshot);currentVersionId=id;dirty=false;userDirty=false;filter='全部';showIgnored=false;$('show-ignored').checked=false;renderResult();renderForm();$('generator').open=false;}
function guardUnsaved(action){if(userDirty){pendingAction=action;set('unsaved-error','');$('unsaved-dialog').showModal();}else action();}
function markChanged(){dirty=true;userDirty=true;renderResult();}
function reviewEvent(id,action){
 if(running)return;const e=result.events.find(e=>e.id===id);if(!e)return;
 if(action==='edit'){openEditor(e);return;}
 if(action==='confirm')e.review='confirmed';
 if(action==='ignore'){e.reviewBeforeIgnore=e.review;e.review='ignored';}
 if(action==='restore'){e.review=e.reviewBeforeIgnore||'pending';delete e.reviewBeforeIgnore;}
 markChanged();const target=$(id);if(target)target.focus({preventScroll:true});else $('show-ignored').focus({preventScroll:true});
}
function openEditor(e){
 editingId=e.id;$('edit-heading').value=e.title;$('edit-reason').value=e.reason;$('edit-scope').value=e.scope;$('edit-review').value=e.review==='confirmed'?'confirmed':'pending';$('edit-applicability').value=e.applicability;set('edit-quote',e.quote);set('edit-error','');
 $('edit-replacement').replaceChildren(new Option('请选择明确的替代决定',''));
 result.events.filter(x=>x.id!==e.id&&x.review!=='ignored').forEach(x=>$('edit-replacement').append(new Option(x.title,x.id)));
 $('edit-replacement').value=e.replacedBy||'';$('replacement-field').hidden=e.applicability!=='replaced';$('edit-dialog').showModal();
}
function applyEdit(event){
 event.preventDefault();const e=result.events.find(x=>x.id===editingId);if(!e)return;
 const title=$('edit-heading').value.trim(),reason=$('edit-reason').value.trim(),scope=$('edit-scope').value.trim(),applicability=$('edit-applicability').value,target=$('edit-replacement').value;
 if(!title||!reason||!scope){set('edit-error','标题、解释和适用范围均需填写；不确定时可明确写“待核对”。');return;}
 if(applicability==='replaced'&&!result.events.some(x=>x.id===target&&x.id!==e.id&&x.review!=='ignored')){set('edit-error','请选择本项目中明确替代它的另一个决定。');return;}
 Object.assign(e,{title,reason,scope,review:$('edit-review').value,applicability,replacedBy:applicability==='replaced'?target:null,editedAt:new Date().toISOString()});
 $('edit-dialog').close();markChanged();$(e.id)?.focus({preventScroll:true});
}
function currentCatalog(){return result?.catalog||(context.sessions?.length?context.sessions:context.anchors)||[];}
function openSessions(e=null){
 evidenceEvent=e;selectedSessionId=e?.anchor.id||null;$('session-search').value='';$('session-source').value='all';renderSessionBrowser();$('evidence-dialog').showModal();
 requestAnimationFrame(()=>{$('session-browser-list').querySelector('[aria-current=true]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});if(e)$('evidence-messages').querySelector('.highlight')?.scrollIntoView({block:'center',behavior:'auto'});});
}
function renderSessionBrowser(){
 const catalog=[...currentCatalog()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)),expected=result?.count||context.counts.claude+context.counts.codex,q=$('session-search').value.trim().toLowerCase(),source=$('session-source').value;
 set('catalog-note',`${project.name} · ${project.path} · 当前携带 ${catalog.length} 条会话。${catalog.length<expected?`当前旧链接仅携带代表样例，另 ${expected-catalog.length} 条只有计数；从 F03 重新进入可携带完整已读目录。`:'本列表只包含本项目本次已读材料。'}`);
 const list=catalog.filter(s=>(source==='all'||s.source===source)&&(!q||(s.id+' '+MuseumDemo.topics[MuseumDemo.topicIndex(s.id)].title).toLowerCase().includes(q)));
 if(!list.some(s=>s.id===selectedSessionId)){selectedSessionId=list[0]?.id||null;if(evidenceEvent?.anchor.id!==selectedSessionId)evidenceEvent=null;}
 set('session-count',`${list.length} / ${catalog.length} 条会话`);$('session-browser-list').replaceChildren();
 for(const s of list){const b=node('button','session-choice');b.type='button';b.dataset.session=s.id;b.setAttribute('aria-label','打开会话 '+s.id);if(s.id===selectedSessionId)b.setAttribute('aria-current','true');b.append(node('strong','',MuseumDemo.topics[MuseumDemo.topicIndex(s.id)].title),node('small','',`${sourceNames[s.source]} · ${s.date}\n${s.id}`));b.addEventListener('click',()=>{selectedSessionId=s.id;evidenceEvent=null;renderSessionBrowser();$('session-browser-list').querySelector('[aria-current=true]')?.focus({preventScroll:true});});$('session-browser-list').append(b)}
 if(!list.length)$('session-browser-list').append(node('p','','没有匹配的会话。试试其他 ID、主题或 Agent。'));
 renderConversation(catalog.find(s=>s.id===selectedSessionId));
}
function renderConversation(session){
 $('evidence-messages').replaceChildren();$('evidence-location').hidden=!evidenceEvent;
 if(!session){set('conversation-title','选择一条会话');set('evidence-meta','');set('evidence-id','');set('source-state','当前筛选没有可显示的对话。');return;}
 set('conversation-title',MuseumDemo.topics[MuseumDemo.topicIndex(session.id)].title);set('evidence-meta',`${sourceNames[session.source]} · ${session.date} · 用户 / Agent / 工具结果`);set('evidence-id',session.id);
 const cached=result?.evidence&&Object.hasOwn(result.evidence,session.id)?result.evidence[session.id]:null,messages=cached?.messages||(!sourceOffline?captureMessages(session):null);
 set('source-state',sourceOffline?cached?'原始来源暂不可访问。以下为本版本保留的引用片段与相邻上下文。':'原始来源暂不可访问，这条会话没有入选引用快照。':cached?'以下引用与上下文来自本版本保留的只读快照。':'以下为本项目合成会话正文，未从真实目录读取。');
 if(!messages){$('evidence-messages').append(node('p','no-conversation','目前无法显示正文。会话元数据仍保留；恢复来源后再查看，不把不可读取解释成“没有对话”。'));return;}
 let matched=false;
 for(let i=0;i<messages.length;i++){const m=messages[i],box=node('div','message');box.dataset.role=m.role;box.id='conversation-message-'+(i+1);box.append(node('strong','',m.label||{user:'用户',assistant:'Agent',tool:'工具结果'}[m.role]),node('time','',m.at||session.date+' 09:'+String(i*2).padStart(2,'0')));const p=node('p');
  if(evidenceEvent&&(m.text===evidenceEvent.quote||m.text===evidenceEvent.agentQuote)){p.append(node('mark','',m.text));box.classList.add('highlight');matched=true;}else p.textContent=m.text;box.append(p);$('evidence-messages').append(box);
 }
 if(evidenceEvent)set('evidence-location',matched?`已定位节点的原话：${session.id} · 高亮消息。上下方保留相邻轮次，原文不可编辑。`:'引用未与当前上下文匹配，保留待核对；不自动补写原话。');
}
function openSaved(){
 refreshVersions();const latest=versionState.versions.at(-1);$('saved-content').replaceChildren();
 if(latest){set('saved-dialog-note','这份内容来自当前浏览器的保存版本。新候选与未保存修改不会改写它。');set('saved-title',`最近保存的版本 v${versionState.versions.length}`);for(const e of latest.snapshot.events){const box=node('div','saved-item');box.append(node('strong','',e.title),node('p','',e.reason),node('p','',`${reviewLabels[e.review]} · 当前适用：${appLabels[e.applicability]} · 范围：${e.scope}`));$('saved-content').append(box)}
 }else{set('saved-dialog-note','这是与 F04 一致的合成已保存版本样例。');set('saved-title','已确认版本样例');$('saved-content').append(...[...savedFixture.childNodes].map(n=>n.cloneNode(true)));}
 $('saved-dialog').showModal();
}
function openSettings(){
 const s=MuseumStore.settings();$('settings-claude').value=s.roots.claude;$('settings-codex').value=s.roots.codex;$('settings-model').value=$('model').value||s.model;$('source-offline').checked=sourceOffline;set('settings-status','');$('settings-dialog').showModal();
}
function saveSettings(){
 try{MuseumStore.saveSettings({roots:{claude:$('settings-claude').value,codex:$('settings-codex').value},model:$('settings-model').value,configured:!!$('endpoint').value});$('model').value=$('settings-model').value.trim();if($('endpoint').value){connection='idle';$('consent').checked=false;}set('settings-status','演示目录与模型名称已保存。未保存访问凭证，也没有读取源文件。');renderForm();}
 catch(error){set('settings-status',error.message);}
}
function beginClear(scope){
 clearScope=scope;$('clear-confirm').value='';$('confirm-clear').disabled=true;set('clear-error','');set('clear-description',scope==='all'?'将清除此浏览器中的全部 Museum 原型版本及演示配置。其他网站数据和 Agent 原始会话不受影响。':scope==='settings'?'将清理演示模型名称和目录配置。项目保存版本仍保留，原始目录不会被修改。':`将清除 ${project.name}（${project.path}）在此浏览器中的原型保存版本及当前未保存内容。其他项目与 Agent 原始会话保留。`);$('clear-dialog').showModal();
}
function resetCurrentView(){result=null;currentVersionId=null;dirty=false;userDirty=false;filter='全部';$('museum').hidden=true;$('waiting').hidden=false;$('generator').open=true;for(const id of ['timeline','overview-grid','before-grid','evidence-messages','session-browser-list'])$(id).replaceChildren();for(const id of ['edit-heading','edit-reason','edit-scope'])$(id).value='';$('saved-content').replaceChildren(...[...savedFixture.childNodes].map(n=>n.cloneNode(true)));}
function performClear(){
 if($('clear-confirm').value!=='清除')return;
 try{const removed=MuseumStore.clear(clearScope,project.path);if(clearScope==='all'||clearScope==='project')resetCurrentView();if(clearScope==='all'||clearScope==='settings'){$('endpoint').value='';$('model').value='';$('credential').value='';connection='unconfigured';$('consent').checked=false;const s=MuseumStore.settings();$('settings-claude').value=s.roots.claude;$('settings-codex').value=s.roots.codex;$('settings-model').value='';}refreshVersions();renderForm();set('settings-status',`已清理 ${removed} 个原型存储条目。没有改动 Agent 原始会话。`);$('clear-dialog').close();}
 catch{set('clear-error','清理未能完成，请重试。未确认成功前不视为已清空。');}
}
function initializeWorkspace(){
 if(!project){$('browse-sessions').hidden=true;$('open-settings').hidden=true;return;}
 refreshVersions();const s=MuseumStore.settings();if(s.configured&&s.model){$('endpoint').value='https://model.example.invalid/v1';$('model').value=s.model;$('credential').value='demo-not-a-real-key';connection='idle';}
 $('browse-sessions').addEventListener('click',()=>openSessions());$('close-sessions').addEventListener('click',()=>$('evidence-dialog').close());$('session-search').addEventListener('input',renderSessionBrowser);$('session-source').addEventListener('change',renderSessionBrowser);
 $('show-ignored').addEventListener('change',()=>{showIgnored=$('show-ignored').checked;renderTimeline();});$('edit-applicability').addEventListener('change',()=>{$('replacement-field').hidden=$('edit-applicability').value!=='replaced'});$('edit-form').addEventListener('submit',applyEdit);$('save-version').addEventListener('click',saveCurrent);
 $('check-updates').addEventListener('click',()=>guardUnsaved(()=>{const latest=versionState.versions.at(-1);if(!latest)return;const c=latest.snapshot.context,counts=c.materialCounts||c.counts;location.href='f04-update-records-prototype.html?'+new URLSearchParams({from:'workspace',project:context.project,claude:String(counts.claude),codex:String(counts.codex),priorUnread:String(Object.values(c.gaps).reduce((a,b)=>a+b,0)),end:c.range.end,history:c.origin||''}).toString()}));
 $('versions').addEventListener('change',()=>{const id=$('versions').value;if(id!=='draft')guardUnsaved(()=>loadVersion(id));});
 $('unsaved-cancel').addEventListener('click',()=>{$('unsaved-dialog').close();pendingAction=null;renderWorkspace()});$('unsaved-discard').addEventListener('click',()=>{const action=pendingAction;pendingAction=null;userDirty=false;$('unsaved-dialog').close();action?.()});$('unsaved-save').addEventListener('click',()=>{if(!saveCurrent()){set('unsaved-error','未保存成功，当前修改仍保留，请重试或取消。');return;}const action=pendingAction;pendingAction=null;$('unsaved-dialog').close();action?.()});$('unsaved-dialog').addEventListener('cancel',()=>{pendingAction=null;renderWorkspace()});
 $('open-settings').addEventListener('click',openSettings);$('save-settings').addEventListener('click',saveSettings);$('source-offline').addEventListener('change',()=>{sourceOffline=$('source-offline').checked;set('settings-status',sourceOffline?'已开启来源不可访问演示，仅使用保存的入选引用。':'已恢复合成来源可访问状态。');if($('evidence-dialog').open)renderSessionBrowser()});document.querySelectorAll('[data-clear]').forEach(b=>b.addEventListener('click',()=>beginClear(b.dataset.clear)));$('clear-confirm').addEventListener('input',()=>$('confirm-clear').disabled=$('clear-confirm').value!=='清除');$('confirm-clear').addEventListener('click',performClear);
 window.addEventListener('beforeunload',e=>{if(userDirty){e.preventDefault();e.returnValue='';}});
 window.addEventListener('storage',e=>{if(e.key?.startsWith(MuseumStore.prefix)){refreshVersions();renderWorkspace();}});
 if(versionState.versions.length)loadVersion(versionState.versions.at(-1).id);else renderForm();
}
