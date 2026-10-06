// Штаб.Точка · чтение состояния штаба без серверной части.
// Панель и MAX-приложение берут безопасную проекцию live/status.json прямо из GitHub
// (ветки telemetry и main), выбирают самую свежую и собирают экранное состояние в браузере.
// Здесь нет секретов: проекцию публикует локальный коллектор штаба, она уже очищена.

export const CDN_CACHE_SECONDS=300;
export const LIVE_URLS=[
 'https://raw.githubusercontent.com/Daridarom/shtab-tochka/telemetry/live/status.json',
 'https://raw.githubusercontent.com/Daridarom/shtab-tochka/main/live/status.json'
];
export const CALENDAR_URLS=[
 'https://raw.githubusercontent.com/Daridarom/shtab-tochka/telemetry/live/calendar.json',
 'https://raw.githubusercontent.com/Daridarom/shtab-tochka/main/live/calendar.json'
];
const CACHE_KEY='shtab.lastState.v2.aggregates';
const CALENDAR_CACHE_KEY='shtab.lastCalendar.v2.private';

// ---------- вспомогательное ----------
export function level(x){return x==='error'?'err':x==='warn'?'wait':x==='unknown'?'none':'ok';}
export function humanName(id,title){return ({system:'Компьютер штаба',visual:'Визуалы',drive:'Документы',task_index:'Индекс задач',skills:'Навыки',queue:'Канал управления',rostok:'Росток',publications:'Публикации',telegram:'Telegram',max:'MAX'})[id]||title||id;}
export function moscowTime(iso,withDate){
 const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '—';
 const o={timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'};
 if(withDate){o.day='2-digit';o.month='2-digit';}
 return d.toLocaleString('ru-RU',o);
}
function moscowDate(iso){const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'}):null;}
export function slotLabel(iso,now=Date.now()){
 if(!iso)return null;
 const same=moscowDate(iso)===moscowDate(now);
 return (same?'сегодня ':'')+moscowTime(iso,!same);
}
export function ageLabel(sec){
 if(sec==null||!Number.isFinite(sec))return 'время неизвестно';
 if(sec<45)return 'только что';
 if(sec<90)return 'минуту назад';
 if(sec<3600)return Math.round(sec/60)+' мин назад';
 if(sec<86400)return Math.round(sec/3600)+' ч назад';
 return Math.round(sec/86400)+' дн назад';
}
function plural(n,one,few,many){const m=n%10,h=n%100;return n+' '+((h>=11&&h<=19)?many:m===1?one:(m>=2&&m<=4)?few:many);}
// Коллектор иногда шлёт «1 сервисов»: чиним склонение в тексте, не трогая смысл.
function short(text,n=150){text=String(text||'');return text.length>n?text.slice(0,n-1).trimEnd()+'…':text;}
function fixPlural(text){
 return String(text||'').replace(/(\d+)\s+сервисов в состоянии ошибки/g,(m,n)=>plural(+n,'сервис','сервиса','сервисов')+' в состоянии ошибки');
}

// ---------- язык управленца ----------
const SINCE_KEY='shtab.issueSince.v1';
const LS=()=>{try{return typeof localStorage!=='undefined'?localStorage:null;}catch(e){return null;}};
export function durationLabel(ms){
 const s=Math.max(0,Math.round(ms/1000));
 if(s<90)return 'только что замечено';
 if(s<3600)return 'уже '+Math.round(s/60)+' мин';
 if(s<86400)return 'уже '+Math.round(s/3600)+' ч';
 return 'уже '+Math.round(s/86400)+' дн';
}
// Запоминаем, когда карточка впервые стала жёлтой или красной (на этом устройстве).
function trackSince(keys,now){
 const ls=LS();let map={};try{map=JSON.parse(ls?.getItem(SINCE_KEY)||'{}')||{};}catch(e){}
 const next={};
 for(const [key,lv] of keys){const prev=map[key];next[key]=prev&&prev.level===lv&&Number.isFinite(prev.since)?prev:{level:lv,since:now};}
 try{ls?.setItem(SINCE_KEY,JSON.stringify(next));}catch(e){}
 return next;
}
function parseChecks(d){const m=/проверки:\s*(.+)$/i.exec(d);return m?m[1].split(/\s*,\s*/).filter(Boolean):[];}
function humanCheck(code){
 if(code==='publication_lock_hold')return 'удерживается блокировка публикации';
 if(code==='reserve_low')return 'низкий резерв готовых публикаций';
 let m=/^slot:(.+)$/.exec(code);if(m)return 'слот '+slotLabel(m[1].length<=16?m[1]+':00+03:00':m[1]);
 m=/^unit:(.+)$/.exec(code);if(m)return 'служба '+m[1].replace(/^privet-planeta-/,'').replace(/\.(timer|service)$/,'');
 return code;
}
// Что случилось, что это значит для дела и что сделать. Техника уходит в «подробности».
function explainCard(c){
 const d=fixPlural(c.detail||'');const lv=level(c.level);
 if(c.detail_available===false)return {level:lv,key:c.id,title:humanName(c.id,c.title),text:d||'Требует проверки',action:'Открыть подробности в локальном ЦУП',details:null};
 const it={level:lv,key:c.id,title:humanName(c.id,c.title),text:d||'требует проверки',action:null,details:null};
 switch(c.id){
  case 'visual':{const m=/(\d+)/.exec(d);const n=m?+m[1]:null;
   if(/ожидают возобновления генератора/i.test(d)){it.text=n!=null?plural(n,'задание ожидает','задания ожидают','заданий ожидают')+' возобновления генератора':'Генератор визуалов ждёт возобновления';it.action='Проверить состояние генератора и продолжить только ожидающие задания';}
   else if(/ожидают изображения/i.test(d)){it.text=d;it.action='Проверить очередь генерации и доступность генератора';}
   else{it.text=n!=null?plural(n,'задача подготовки изображения завершилась','задачи подготовки изображений завершились','задач подготовки изображений завершились')+' с ошибкой. Причину нужно проверить отдельно':'Подготовка изображений требует проверки';it.action='Проверить причину остановки, исправить её и повторить подготовку';}
   it.details=d;break;}
  case 'system':{const m=/свободно\s+([\d.,]+)\s*ГБ/i.exec(d);const free=m?parseFloat(m[1].replace(',','.')):null;
   if(/второй исполнитель активен без подтверждённого read-only режима/i.test(d)){it.text='Запущен дополнительный локальный исполнитель без подтверждённого режима только чтения';it.action='Проверить режим локального исполнителя и оставить запись только в разрешённых контурах';}
   else if(free!=null&&free<15){it.text='Мало места на диске: свободно '+free+' ГБ';it.action='Освободить место на машине штаба';}
   else{it.text=d||'Работа компьютера требует проверки';it.action='Проверить конкретный системный сигнал в подробностях';}
   it.details=d;break;}
  case 'drive':it.text='Свежесть документов пока не подтверждена';it.action='Проверить последнюю успешную синхронизацию и обновление списка документов';it.details=d;break;
  case 'task_index':it.text=/облачная копия ожидает обновления/i.test(d)?'Локальный индекс задач актуален, облачная копия ещё не подтверждена':(d||'Индекс задач требует проверки');it.action='Сверить локальную и облачную версии и обновить облако только после проверки версии';it.details=d;break;
  case 'skills':it.text=d||'Состояние реестра навыков требует проверки';it.action='Проверить загрузку активных навыков, версии и последнюю успешную проверку';it.details=d;break;
  case 'queue':{
   const qm=/ожидают:\s*(\d+)/i.exec(d),hb=/проверка связи\s+(\d+)\s*с назад/i.exec(d);
   const waiting=qm?Number(qm[1]):0,heartbeat=hb?Number(hb[1]):null,runnerAlive=heartbeat!=null&&heartbeat<=120;
   if(waiting>0&&runnerAlive){
    it.text='В очереди '+waiting+' задач. Исполнитель на связи, но задачи ещё не разобраны';
    it.action='Проверить диспетчер и условия запуска ожидающих задач; runner перезапускать только если пропадёт связь';
   }else if(waiting>0){
    it.text='Задачи в очереди ждут исполнения';
    it.action='Проверить связь с runner и затем причину ожидания задач';
   }else if(runnerAlive){
    it.text='Канал управления на связи, ожидающих задач нет';
    it.action=null;
   }else{
    it.text='Связь с исполнителем очереди не подтверждена';
    it.action='Проверить службу runner на машине штаба';
   }
   it.details=d;break;
  }
  case 'telegram':case 'max':it.text='Получатель сообщений '+it.title+' не работает: входящие не собираются';it.action='Перезапустить получатель '+it.title;it.details=d;break;
  case 'rostok':it.text='Росток сигналит '+(lv==='err'?'ошибку':'предупреждение')+', причина в сводке не указана';it.action='Открыть отчёт Ростка на машине штаба';it.details=d;break;
  case 'publications':{const checks=parseChecks(d);
   if(checks.length){it.text='Автопубликация остановлена проверкой: '+checks.map(humanCheck).join(', ');it.action='Проверить указанную причину и устранить её до публикации';}
   else{it.text='Есть неясные или ошибочные доставки';it.action='Проверить доставку последних публикаций';}
   it.details=d;break;}
  default:it.details=d;
 }
 return it;
}
function explainWorkflow(row,w){return {level:row[1],key:'wf:'+(w.id||w.name),title:'Процесс «'+row[0]+'»',text:row[2],action:'Открыть n8n и перезапустить процесс',details:null};}

// ---------- нейтральные состояния ----------
export function offlineState(){
 return {mode:'offline',source:null,asOf:null,ageSeconds:null,ttlSeconds:120,cached:false,
  verdict:{level:'wait',text:'Нет связи с источником'},notice:{level:'wait',text:'Нет связи с источником состояния. Проверьте сеть и повторите'},
  metrics:{active:null,total:null,attention:null,done:null,dailyLimit:null,nextSlotLabel:null,problems:null,oldest:null},rostok:null,artifactRuntime:null,taskSummary:null,inboxSummary:null,calendar:null,workflows:[],projects:[],cards:[],
  focus:[],
  systems:[['Обновление данных','wait','Нет связи с источником состояния']],
  events:[['Сейчас','Состояние штаба недоступно: нет связи с источником','wait']],
  inbox:[]};
}

// ---------- загрузка ----------
export async function fetchLive(urls=LIVE_URLS){
 const hits=await Promise.all(urls.map(async url=>{
  try{
   const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)return null;
   const raw=await r.json();
   if(!raw||!raw.generated_at||raw.visibility!=='public_aggregates'||raw.detail_available!==false)return null;
   const ts=Date.parse(raw.generated_at);
   return {raw,ts:Number.isFinite(ts)?ts:0,source:url.includes('/telemetry/')?'telemetry-branch':'main-branch'};
  }catch(e){return null;}
 }));
 return hits.filter(Boolean).sort((a,b)=>b.ts-a.ts)[0]||null;
}

export function normalizeCalendar(raw){
 if(!raw||raw.schema!=='calendar-1'||!raw.generated_at||!Array.isArray(raw.events))return null;
 const privateDetails=raw.visibility==='private'||raw.detail_available===false;
 const events=(privateDetails?[]:raw.events).map(e=>{
  if(!e||!e.id||!e.start)return null;
  return {
   id:String(e.id),title:String(e.title||'Событие'),kind:e.kind||'other',start:e.start,end:e.end||null,
   endConfirmed:!!e.endConfirmed,allDay:!!e.allDay,format:e.format||null,location:e.location||null,
   project:e.project||null,source:'Google Calendar'
  };
 }).filter(Boolean);
 return {schema:'calendar-1',generated_at:raw.generated_at,ttl_seconds:raw.ttl_seconds||21600,events,visibility:raw.visibility||null,detail_available:!privateDetails,source_status:raw.source_status||null};
}
export async function fetchCalendar(urls=CALENDAR_URLS){
 const hits=await Promise.all(urls.map(async url=>{
  try{
   const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)return null;
   const raw=normalizeCalendar(await r.json());
   if(!raw||raw.visibility!=='private'||raw.detail_available!==false)return null;
   const ts=Date.parse(raw.generated_at);
   return {raw,ts:Number.isFinite(ts)?ts:0,source:url.includes('/telemetry/')?'telemetry-calendar':'main-calendar'};
  }catch(e){return null;}
 }));
 return hits.filter(Boolean).sort((a,b)=>b.ts-a.ts)[0]||null;
}

export function normalizeTaskSummary(raw){
 if(!raw||raw.schema!=='tasks-public-1'||!raw.generated_at||!Array.isArray(raw.items))return null;
 const allowedStatus=new Set(['OPEN','IN_PROGRESS','WAITING','BLOCKED','DONE','PROPOSED','DEFERRED','HOLD','ON_HOLD']);
 const privateDetails=raw.visibility==='private'||raw.detail_available===false;
 const items=(privateDetails?[]:raw.items).map(x=>{
  if(!x||!x.id||!x.title)return null;
  const status=String(x.status||'OPEN').toUpperCase();
  return {id:String(x.id),title:short(x.title,240),status:allowedStatus.has(status)?status:'OPEN',
   deadline:x.deadline||null,project:x.project||null,owner:x.owner||null,fresh:x.fresh===true,verified_at:x.verified_at||null};
 }).filter(Boolean);
 return {schema:'tasks-public-1',generated_at:raw.generated_at,ttl_seconds:raw.ttl_seconds||7200,
  authority:raw.authority||'project TASKS',partial:raw.partial!==false,scope:Array.isArray(raw.scope)?raw.scope:[],
  visibility:raw.visibility||null,detail_available:!privateDetails,items,proposal_count:Number.isFinite(raw.proposal_count)?raw.proposal_count:null,today_complete:raw.today_complete===true,
  stale_rows:Number.isFinite(raw.stale_rows)?raw.stale_rows:0,
  missing_sources:Array.isArray(raw.missing_sources)?raw.missing_sources.filter(x=>typeof x==='string').slice(0,50):[]};
}
export function normalizeInboxSummary(raw){
 if(!raw||raw.schema!=='inbox-summary-1'||!raw.generated_at||!raw.channels||typeof raw.channels!=='object')return null;
 const channels={};
 for(const key of ['telegram','max']){
  const x=raw.channels[key];if(!x||typeof x!=='object')continue;
  channels[key]={read_ok:x.read_ok===true,total:Number.isFinite(x.total)?Math.max(0,Math.trunc(x.total)):null,
   last_24h:Number.isFinite(x.last_24h)?Math.max(0,Math.trunc(x.last_24h)):null,last_message_at:x.last_message_at||null,
   attention_count:Number.isFinite(x.attention_count)?Math.max(0,Math.trunc(x.attention_count)):null};
 }
 return {schema:'inbox-summary-1',generated_at:raw.generated_at,ttl_seconds:raw.ttl_seconds||120,channels,detail_available:raw.detail_available===true};
}

export function normalizeArtifactRuntime(raw){
 const a=raw&&typeof raw.artifact_runtime==='object'&&!Array.isArray(raw.artifact_runtime)?raw.artifact_runtime:null;
 if(!a)return null;
 const norm=v=>String(v??'').trim().toLowerCase().replace(/[\s-]+/g,'_');
 const n=v=>Number.isFinite(v)?Math.max(0,Math.trunc(v)):null;
 const mode=norm(a.mode||a.phase||'pilot');
 const result=norm(a.last_result||a.result||a.state||'unknown');
 const stage=norm(a.last_stage||a.stage||'');
 return {
  mode:['pilot','shadow','canonical'].includes(mode)?mode:'pilot',
  active:a.active===true,
  verified:n(a.verified),
  blocked:n(a.blocked),
  pendingEvidence:n(a.pending_evidence??a.pendingEvidence),
  lastResult:['verified','blocked','pending','needs_more_evidence','unknown'].includes(result)?result:'unknown',
  lastStage:['task','skill','artifact','evidence','state'].includes(stage)?stage:null,
  updatedAt:a.updated_at||a.updatedAt||null
 };
}

function workflowRow(w){
 const ok=w.active&&w.runtime_running&&w.execution_recent&&w.last_status==='success';
 if(ok)return [w.name||w.id,'ok','Работает · последний запуск успешный'];
 if(!w.active)return [w.name||w.id,'wait','Выключен'];
 if(!w.runtime_running)return [w.name||w.id,'err','Не запущен'];
 if(w.last_status&&w.last_status!=='success')return [w.name||w.id,'err','Последний запуск завершился ошибкой'];
 if(!w.execution_recent)return [w.name||w.id,'wait','Давно не запускался'];
 return [w.name||w.id,'wait','Состояние неизвестно'];
}

export function toState(raw,now=Date.now()){
 const cards=(Array.isArray(raw.cards)?raw.cards:[]).map(c=>raw.detail_available===false?{...c,detail_available:false}:c);
 const wfs=Array.isArray(raw.workflows)?raw.workflows:[];
 const active=wfs.filter(w=>w.active&&w.runtime_running&&w.execution_recent&&w.last_status==='success').length;
 const attention=cards.filter(c=>c.level==='warn'||c.level==='error').length;
 const systems=cards.map(c=>[humanName(c.id,c.title),level(c.level),fixPlural(c.detail)||'Нет подробностей']);
 const rows=wfs.map(workflowRow);
 if(wfs.length)systems.push(['Автоматические процессы',active===wfs.length?'ok':'wait',active+' из '+wfs.length+' работают штатно']);
 // проблемы на языке управленца, с длительностью
 const items=[...cards.filter(c=>c.level==='warn'||c.level==='error').map(explainCard),...rows.map((r,i)=>[r,wfs[i]]).filter(([r])=>r[1]!=='ok').map(([r,w])=>explainWorkflow(r,w))];
 const since=trackSince(items.map(it=>[it.key,it.level]),now);
 for(const it of items){const s=since[it.key];it.since=s?s.since:now;it.sinceLabel=durationLabel(now-it.since);it.sinceTime=moscowTime(it.since);}
 items.sort((a,b)=>(a.level==='err'?0:1)-(b.level==='err'?0:1)||a.since-b.since);
 const nErr=items.filter(x=>x.level==='err').length,nWarn=items.length-nErr;
 const oldest=items.length?items.reduce((m,x)=>Math.min(m,x.since),Infinity):null;
 const oldestLabel=oldest!=null?durationLabel(now-oldest):null;
 const verdict=!items.length?{level:'ok',text:'Всё штатно'}:{level:nErr?'err':'wait',text:[nErr?plural(nErr,'ошибка','ошибки','ошибок'):null,nWarn?plural(nWarn,'предупреждение','предупреждения','предупреждений'):null].filter(Boolean).join(' · ')+(oldestLabel&&oldestLabel!=='только что замечено'?' · старейшая '+oldestLabel.replace('уже ',''):'')};
 const issues=cards.filter(c=>c.level==='warn'||c.level==='error').sort((a,b)=>(a.level==='error'?0:1)-(b.level==='error'?0:1));
 const events=[
  [moscowTime(raw.generated_at),'Состояние штаба обновлено автоматически','ok'],
  ...issues.slice(0,4).map(c=>['Сейчас',humanName(c.id,c.title)+': '+(fixPlural(c.detail)||'требует проверки'),level(c.level)])
 ];
 const inbox=items.map(it=>['Внимание',it.title+': '+it.text,it.level]);
 const r=raw.rostok&&typeof raw.rostok==='object'?raw.rostok:null;
 const artifactRuntime=normalizeArtifactRuntime(raw);
 const taskSummary=normalizeTaskSummary(raw.task_summary);
 const inboxSummary=normalizeInboxSummary(raw.inbox_summary);
 const done=r&&Number.isFinite(r.published_today)?r.published_today:null;
 const rostok=r?{publishedToday:done,dailyLimit:r.daily_limit??null,queue:r.queue??null,statusLabel:r.unresolved?'нужна сверка доставки':level(cards.find(c=>c.id==='publications')?.level||'unknown')!=='ok'?'требует проверки':Number.isFinite(r.queue)&&r.queue>0?'есть готовые посты':'нет готовых постов',nextSlot:r.next_slot??null,nextSlotLabel:slotLabel(r.next_slot,now),totalPublished:r.total_published??null,unresolved:r.unresolved??null}:null;
 return {mode:'live',source:null,asOf:raw.generated_at,ageSeconds:null,ttlSeconds:raw.ttl_seconds||120,cached:false,
  verdict,notice:null,
  metrics:{active,total:wfs.length,attention,done,dailyLimit:rostok?rostok.dailyLimit:null,nextSlotLabel:rostok?rostok.nextSlotLabel:null,problems:items.length,oldest:oldestLabel},
  rostok,artifactRuntime,taskSummary,inboxSummary,workflows:rows,projects:[],focus:items,systems,events,inbox,
  cards:cards.map(c=>({id:c.id,title:humanName(c.id,c.title),level:level(c.level),detail:fixPlural(c.detail)||''}))};
}

// ---------- кэш последнего состояния (localStorage, только безопасная проекция) ----------
function readCache(){try{localStorage.removeItem('shtab.lastState.v1');const j=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return j&&j.raw&&j.raw.generated_at&&j.raw.visibility==='public_aggregates'&&j.raw.detail_available===false?j:null;}catch(e){return null;}}
function writeCache(raw,source){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),raw,source}));}catch(e){}}
function readCalendarCache(){try{localStorage.removeItem('shtab.lastCalendar.v1');const j=JSON.parse(localStorage.getItem(CALENDAR_CACHE_KEY)||'null');return j&&j.raw&&j.raw.generated_at&&j.raw.visibility==='private'&&j.raw.detail_available===false?j:null;}catch(e){return null;}}
function writeCalendarCache(raw,source){try{localStorage.setItem(CALENDAR_CACHE_KEY,JSON.stringify({savedAt:Date.now(),raw,source}));}catch(e){}}

function finish(raw,source,now,offline){
 const state=toState(raw,now);
 state.source=source;
 const age=(now-Date.parse(raw.generated_at))/1000;
 const ageSeconds=Number.isFinite(age)?Math.max(0,Math.round(age)):null;
 state.ageSeconds=ageSeconds;
 const fresh=ageSeconds!=null&&ageSeconds<=Math.max(120,state.ttlSeconds||120)+CDN_CACHE_SECONDS;
 if(offline){
  state.mode='offline';state.cached=true;
  state.systems.unshift(['Обновление данных','err','Нет связи · показаны данные от '+moscowTime(raw.generated_at,true)]);
  state.notice={level:'err',text:'Нет связи с источником. Показаны данные '+ageLabel(ageSeconds)};
 }else if(fresh){
  state.mode='live';
  state.systems.unshift(['Обновление данных','ok','Работает автоматически · '+ageLabel(ageSeconds)]);
 }else{
  state.mode='stale';
  state.systems.unshift(['Обновление данных','wait','Данные устарели · '+ageLabel(ageSeconds)]);
  state.notice={level:'wait',text:'Данные устарели, обновлены '+ageLabel(ageSeconds)};
 }
 return state;
}

// Главная функция: возвращает экранное состояние в одном из режимов live / stale / offline.
export async function loadState(now=Date.now()){
 const [hit,calendarHit]=await Promise.all([fetchLive(),fetchCalendar()]);
 let calendar=calendarHit?.raw||null;
 if(calendarHit)writeCalendarCache(calendarHit.raw,calendarHit.source);
 if(!calendar)calendar=readCalendarCache()?.raw||null;
 if(hit){writeCache(hit.raw,hit.source);const state=finish(hit.raw,hit.source,now,false);state.calendar=calendar;return state;}
 const c=readCache();
 if(c){const state=finish(c.raw,c.source,now,true);state.calendar=calendar;return state;}
 const state=offlineState();state.calendar=calendar;return state;
}
// Мгновенное состояние из кэша для первой отрисовки, пока идёт запрос.
export function cachedState(now=Date.now()){
 const c=readCache();if(!c)return null;
 const state=finish(c.raw,c.source,now,true);state.calendar=readCalendarCache()?.raw||null;return state;
}

// Авто-обновление: сразу, по таймеру, при возврате на экран и при появлении сети.
export function startLive(onState,{interval=30000}={}){
 let timer=null,busy=false,stopped=false;
 const cached=cachedState();if(cached){cached.mode='loading';onState(cached);}
 async function refresh(){if(busy||stopped)return;busy=true;try{onState(await loadState());}catch(e){}finally{busy=false;}}
 const onVis=()=>{if(typeof document!=='undefined'&&document.visibilityState==='visible')refresh();};
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVis);
 if(typeof window!=='undefined')window.addEventListener('online',refresh);
 refresh();timer=setInterval(refresh,interval);
 return {refresh,stop(){stopped=true;clearInterval(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVis);if(typeof window!=='undefined')window.removeEventListener('online',refresh);}};
}
export function describeMode(s){return s.mode==='live'?'Данные свежие':s.mode==='stale'?'Данные устарели':s.mode==='offline'?'Нет связи с источником':'Обновляем…';}
