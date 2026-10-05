// Экраны MAX-ЦУП. Все данные приходят сверху: телеметрия (s) и защищённый слой (priv). Ничего не выдумываем.
import {useMemo,useState,useRef} from 'react';
import {moscowTime} from '../../public/live.js';
import {documentView,channelViews} from '../../public/section-state.js';
import {projectTree} from '../../public/projects.js';
import {schemeSVG} from '../../public/orbit.js';
import * as M from '../../public/model.js';
import {haptic} from './max.js';
import {Row,Empty,Card,Seg,SourceLine,Field,Chip,openExternal} from './ui.jsx';

// ---------- общие куски ----------
function Issue({it}){
 return <div className={'focusRow '+it.level}><span className={'dot '+it.level}/><div>
  <b>{it.title}</b><small>{it.text}</small>
  {it.action&&<em className="act"><span>Что сделать:</span> {it.action}</em>}
  {it.sinceLabel&&<i className="since">На этом устройстве: {it.sinceLabel}{it.sinceTime&&it.sinceLabel!=='только что замечено'?' · с '+it.sinceTime:''}</i>}
  {it.details&&<details><summary>Подробности</summary><p>{it.details}</p></details>}
 </div></div>;
}
function Signals({s,title='Требует внимания',className=''}){
 const n=s.focus.length,known=['live','stale'].includes(s.mode);
 const calm=known?(s.mode==='stale'?'В последнем снимке критичных сигналов нет':'Критичных сигналов нет'):(s.mode==='loading'?'Получаем состояние штаба':'Состояние пока не подтверждено');
 return <Card title={title} aside={n?String(n):(known?'по снимку':'нет данных')} className={'hud focus '+className}>
  {n?s.focus.map(it=><Issue key={it.key} it={it}/>):<div className={'focusRow '+(known?'ok':'none')}><span className={'dot '+(known?'ok':'none')}/><div><b>{calm}</b>{known&&s.metrics.active!=null&&<small>{s.metrics.active} из {s.metrics.total} процессов работают штатно</small>}</div></div>}
 </Card>;
}
function projectName(id){const walk=l=>{for(const x of l){if(x.id===id||x.name===id)return x.name;const r=x.children&&walk(x.children);if(r)return r;}return null;};return walk(projectTree)||id;}
function Rostok({r}){
 if(!r)return <Card title="Росток · публикации"><Empty text="Подтверждённые данные публикаций пока недоступны"/></Card>;
 const stat=(k,v)=><div className="stat" key={k}><small>{k}</small><b>{v??'—'}</b></div>;
 return <Card title="Росток · публикации" aside={r.statusLabel||'требует проверки'}>
  <div className="stats">{stat('Сегодня',r.publishedToday!=null&&r.dailyLimit!=null?r.publishedToday+' из '+r.dailyLimit:r.publishedToday)}{stat('В очереди',r.queue)}{stat('Следующий слот',r.nextSlotLabel)}{stat('Всего опубликовано',r.totalPublished)}</div>
 </Card>;
}
const PROOF_FLOW=[
 ['01','Задача','фиксируем результат'],
 ['02','Навык','выбираем способ'],
 ['03','Артефакт','получаем объект'],
 ['04','Проверка','собираем доказательства'],
 ['05','Состояние','обновляем только после проверки']
];
function ProofFlow({runtime,mode}){
 const sourceKnown=!!runtime&&['live','stale'].includes(mode);
 const tone=!sourceKnown?'none':runtime.lastResult==='verified'?'ok':runtime.lastResult==='blocked'?'err':['pending','needs_more_evidence'].includes(runtime.lastResult)?'wait':'none';
 const modeLabel=runtime?({pilot:'пилот',shadow:'теневой режим',canonical:'рабочий режим'}[runtime.mode]||runtime.mode):'статус не подключён';
 const resultLabel=!sourceKnown?'Живой статус артефактов не подтверждён':runtime.lastResult==='verified'?'Последний результат подтверждён':runtime.lastResult==='blocked'?'Последний результат остановлен проверкой':['pending','needs_more_evidence'].includes(runtime.lastResult)?'Проверка ещё не завершена':'Итог не подтверждён источником';
 const detail=!sourceKnown?'Цепочка показана как правило работы. Безопасный агрегат по артефактам пока не приходит в телеметрию, поэтому зелёный статус не рисуем.':runtime.lastResult==='verified'?'Состояние повышено только после наличия артефакта и доказательства проверки.':runtime.lastResult==='blocked'?'Проверка не дала перевести результат в «готово» — это штатная защита от ложного DONE.':['pending','needs_more_evidence'].includes(runtime.lastResult)?'До завершения проверки результат остаётся неподтверждённым.':'Источник не дал достаточных данных о последнем результате.';
 const counts=[runtime?.verified!=null&&'подтверждено '+runtime.verified,runtime?.blocked!=null&&'заблокировано '+runtime.blocked,runtime?.pendingEvidence!=null&&'ждут проверки '+runtime.pendingEvidence].filter(Boolean);
 const stageByNo={01:'task',02:'skill',03:'artifact',04:'evidence',05:'state'};
 return <Card title="Контур доказуемой работы" aside={modeLabel} className="span2 proofCard">
  <div className="proofFlow">{PROOF_FLOW.map(([n,t,d])=><div className={'proofStep'+(runtime?.lastStage&&runtime.lastStage===stageByNo[n]?' current':'')} key={n}><small>{n}</small><b>{t}</b><em>{d}</em></div>)}</div>
  <div className={'proofState '+tone}><span className={'dot '+tone}/><div><b>{resultLabel}</b><small>{detail}</small></div></div>
  {counts.length>0&&<div className="chips">{counts.map(x=><Chip key={x}>{x}</Chip>)}</div>}
  <small className="since">{sourceKnown&&runtime.updatedAt?'Обновление контура: '+moscowTime(runtime.updatedAt,true)+' МСК':'Task → Skill → Artifact → Evidence → State'}</small>
 </Card>;
}


function worstTone(levels=[]){
 if(levels.includes('err'))return 'err';
 if(levels.includes('wait'))return 'wait';
 if(levels.includes('ok'))return 'ok';
 return 'none';
}
function cardTone(s,id){
 if(!['live','stale'].includes(s.mode))return 'none';
 const c=(s.cards||[]).find(x=>x.id===id);
 return c&&['ok','wait','err'].includes(c.level)?c.level:'none';
}
function OperationalPicture({s,priv,age}){
 const freshness=M.operationalFreshness(s,priv,age??s.ageSeconds??null);
 const evidence=M.resultEvidence(s);
 const proc=s.metrics.active!=null&&s.metrics.total!=null?s.metrics.active+' из '+s.metrics.total:'—';
 const rostok=s.rostok?(s.rostok.publishedToday!=null&&s.rostok.dailyLimit!=null?s.rostok.publishedToday+' из '+s.rostok.dailyLimit:s.rostok.publishedToday??'—'):'—';
 const next=s.rostok?.nextSlotLabel||'—';
 const freshnessTone=M.sourceLevel(freshness.state);
 const trustTone=evidence.level==='err'||freshness.failed>0?'err':freshness.state===M.SOURCE.LIVE&&freshness.qualityIssues===0&&evidence.level==='ok'?'ok':'wait';
 const trust=trustTone==='ok'?'Рабочая картина подтверждена':trustTone==='err'?'Есть неподтверждённый результат или недоступный источник':'Картина частичная: часть данных или результата требует проверки';
 const verdict=s.verdict?.text||(s.mode==='loading'?'Получаем состояние':'Состояние не подтверждено');
 return <Card title="Оперативная картина" aside={verdict} className="span2 commandCard">
  <div className="commandGrid">
   <div className="commandMetric"><small>Сервисы</small><b>{proc}</b><em>технически запущены и недавно отработали</em></div>
   <div className={'commandMetric '+freshnessTone}><small>Данные</small><b>{freshness.fresh} из {freshness.total}</b><em>источников свежие</em></div>
   <div className="commandMetric"><small>Результат</small><b>{rostok}</b><em>публикаций Ростка сегодня · следующий слот {next}</em></div>
   <div className={'commandMetric '+evidence.level}><small>Подтверждение</small><b>{evidence.label}</b><em>{evidence.detail}</em></div>
  </div>
  <div className={'commandTrust '+trustTone}><span className={'dot '+trustTone}/><div><b>{trust}</b><small>{freshness.detail}</small></div></div>
 </Card>;
}
function HarnessCard({s}){
 const channels=worstTone([cardTone(s,'max'),cardTone(s,'telegram')]);
 const workflows=worstTone((s.workflows||[]).map(x=>x[1]));
 const artifact=s.artifactRuntime;
 const artifactTone=!artifact?'none':artifact.lastResult==='blocked'?'err':['pending','needs_more_evidence'].includes(artifact.lastResult)?'wait':artifact.lastResult==='verified'?'ok':'none';
 const artifactText=!artifact?'Агрегат артефактов и доказательств пока не приходит в телеметрию':artifact.lastResult==='verified'?'Последний результат подтверждён доказательствами':artifact.lastResult==='blocked'?'Проверка остановила перевод результата в готовое состояние':['pending','needs_more_evidence'].includes(artifact.lastResult)?'Есть результат, но проверка ещё не завершена':'Статус проверки не подтверждён';
 const layers=[
  ['01','Входы',channels,'MAX и Telegram · приём сигналов и сообщений'],
  ['02','Контекст и состояние',cardTone(s,'drive'),(s.cards||[]).find(x=>x.id==='drive')?.detail||'Состояние контекста не подтверждено'],
  ['03','Навыки',cardTone(s,'skills'),(s.cards||[]).find(x=>x.id==='skills')?.detail||'Реестр активных навыков пока не включён в безопасную телеметрию'],
  ['04','Оркестрация',workflows,s.workflows?.length?s.workflows.filter(x=>x[1]==='ok').length+' из '+s.workflows.length+' процессов штатно':'Состояние процессов не подтверждено'],
  ['05','Исполнение',cardTone(s,'queue'),(s.cards||[]).find(x=>x.id==='queue')?.detail||'Канал исполнения не подтверждён'],
  ['06','Артефакты и проверка',artifactTone,artifactText],
  ['07','Результат',worstTone([cardTone(s,'rostok'),cardTone(s,'publications')]),(s.cards||[]).find(x=>x.id==='publications')?.detail||'Доставка результата не подтверждена']
 ];
 const known=layers.filter(x=>x[2]!=='none').length;
 return <Card title="Агентный каркас" aside={known+' из '+layers.length+' слоёв измеряются'} className="span2 harnessCard">
  <p className="desc">ЦУП показывает не только сервисы, но и весь путь работы: входы → контекст → навыки → оркестрация → исполнение → артефакты и проверка → результат. Серым оставляем то, чего источник пока не умеет подтверждать.</p>
  <div className="harnessStack">{layers.map(([n,title,tone,text])=><div className={'harnessLayer '+tone} key={n}><span className="harnessNo">{n}</span><span className={'dot '+tone}/><div><b>{title}</b><small>{text}</small></div></div>)}</div>
 </Card>;
}

function Workflows({list,id}){
 return <Card id={id} title="Автоматические процессы" aside={list.length?list.filter(w=>w[1]==='ok').length+' из '+list.length:''}>
  {list.length?list.map((x,i)=><Row key={i} dot={x[1]} title={x[0]} text={x[2]}/>):<Empty text="Список процессов появится после первого обновления"/>}
 </Card>;
}
function Documents({s}){
 const d=documentView(s);
 return <Card id="documents" title="Документы" aside={d.stale?'последний снимок':!d.available?'нет данных':d.level==='ok'?'проверено источником':'нужно внимание'}>
  <Row dot={d.available?d.level:'none'} title={d.title} text={d.detail}/>
  <details><summary>Контекст, индекс и оригиналы — разные проверки</summary><p>{d.context}. {d.index}. {d.originals}</p></details>
  {d.asOf&&<small className="since">Снимок панели: {moscowTime(d.asOf,true)} МСК. Это не время сохранения документов.</small>}
 </Card>;
}

// ---------- события ----------
function EventItem({e,onOpen,big}){
 const w=M.eventWhen(e),k=M.EVENT_KINDS[e.kind],fmt=M.eventFormat(e);
 return <button type="button" className={'event k-'+e.kind+(k.presence?'':' nopresence')+(big?' big':'')} onClick={()=>{haptic('select');onOpen(e.id);}}>
  <div className="evTime"><b>{w.start}</b>{w.end&&<small>до {w.end}</small>}</div>
  <div className="evBody">
   <b>{e.title}</b>
   <small>{[k.title,e.project&&projectName(e.project),fmt,e.location].filter(Boolean).join(' · ')}</small>
   {w.endNote&&<small className="muted2">{w.endNote}</small>}
   {!k.presence&&<small className="muted2">{e.kind==='payment'?'Финансовое событие · не встреча':'Без личного присутствия'}</small>}
  </div>
 </button>;
}
export function EventSheet({e}){
 const w=M.eventWhen(e),k=M.EVENT_KINDS[e.kind];
 return <>
  <div className="chips"><Chip tone={'k-'+e.kind}>{k.title}</Chip>{M.eventFormat(e)&&<Chip>{M.eventFormat(e)}</Chip>}</div>
  <Field k={e.allDay?'Дата':'Начало'}>{e.allDay?M.dayTitle(M.dayKey(e.start)):w.start+' · '+M.dayTitle(M.dayKey(e.start))}</Field>
  {e.allDay&&e.endConfirmed&&<Field k="До">{M.dayTitle(M.dayKey(Date.parse(e.end)-86400000))}</Field>}
  {k.presence&&!e.allDay&&<Field k="Окончание">{w.end||'Окончание не указано'}</Field>}
  <Field k="Проект">{e.project&&projectName(e.project)}</Field>
  <Field k="Место">{e.location}</Field>
  {e.joinUrl&&<button type="button" className="primary" onClick={()=>{haptic('light');openExternal(e.joinUrl);}}>Подключиться</button>}
  <p className="empty">Перенос задачи не переносит встречу. Изменение события делается отдельно, в самом календаре.</p>
 </>;
}

// ---------- СЕГОДНЯ ----------
export function Today({s,priv,go,openSheet,age}){
 const now=Date.now(),cal=priv.calendarSource||priv.source,taskSrc=priv.taskSource||priv.source,inboxSrc=priv.inboxSource||priv.source,inboxAgg=priv.inboxSummarySource||inboxSrc,todayKey=M.dayKey(now);
 const next=M.nextEvent(priv.events,now);
 const later=M.eventsOfDay(priv.events,todayKey).filter(e=>e!==next&&Date.parse(e.start)>now);
 const actions=M.topActions(priv.tasks);
 // Возраст считаем так же, как в шапке, чтобы строки не расходились.
 const tel={...M.telemetrySource(s),ageSeconds:age??s.ageSeconds??null};
 const calOn=cal.state!==M.SOURCE.NOT_CONNECTED;
 return <div className="home">
  <OperationalPicture s={s} priv={priv} age={age}/>
  <Card title="Ближайшее событие" className="span2 hero">
   {next?<EventItem e={next} big onOpen={id=>openSheet({kind:'event',id})}/>:<div className="heroEmpty"><b>{calOn&&M.confirmsAbsence(cal)?'Сегодня больше событий нет':'Нет подтверждённых событий'}</b><small>{M.sourceNote('Календарь',cal)}</small></div>}
   <button type="button" className="ghost" onClick={()=>go('calendar')}>Открыть календарь</button>
  </Card>
  <Card title="Главные действия" aside={actions.length?String(actions.length):''} className="span2">
   {actions.length?actions.map((t,i)=><button type="button" className="action" key={t.id} onClick={()=>{haptic('select');openSheet({kind:'task',id:t.id});}}><span className="num">{i+1}</span><div><b>{t.title}</b><small>{[t.project&&projectName(t.project),M.statusTitle(t.status),t.deadline&&'срок '+t.deadline].filter(Boolean).join(' · ')}</small></div></button>)
    :<Empty text={taskSrc.state===M.SOURCE.NOT_CONNECTED?'Реестр задач к экрану не подключён — главные действия появятся после подключения защищённого канала.':priv.taskMeta?.partial?'В безопасном срезе сейчас нет активных действий. Полный приватный реестр ещё не подключён.':'Открытых задач с приоритетом нет по данным реестра.'}/>}
   {priv.taskMeta?.partial&&<small className="since">Безопасный срез задач · чувствительные и приватные направления здесь не публикуются.</small>}
  </Card>
  {calOn&&<Card title="Дальше сегодня" aside={later.length?String(later.length):''}>{later.length?later.map(e=><EventItem key={e.id} e={e} onOpen={id=>openSheet({kind:'event',id})}/>):<Empty text={M.emptyDayText(cal)}/>}</Card>}
  <Signals s={s} className="span2"/>
  <Card title="Источники данных" className="span2">
   <SourceLine name="Состояние Штаба" src={tel}/>
   <SourceLine name="Календарь" src={cal} compact/>
   <SourceLine name="Задачи" src={taskSrc} compact/>
   <SourceLine name={priv.inboxSummary&&!priv.inboxSummary.detailAvailable?"Входящие · агрегаты":"Входящие"} src={priv.inboxSummary&&!priv.inboxSummary.detailAvailable?inboxAgg:inboxSrc} compact/>
   <button type="button" className="ghost" onClick={()=>go('systems')}>Схема и системы</button>
  </Card>
 </div>;
}

// ---------- КАЛЕНДАРЬ ----------
export function CalendarScreen({priv,openSheet,store}){
 const [shift,setShift]=useState(0);
 const [sel,setSel]=useState(()=>M.dayKey(Date.now()));
 const week=M.weekOf(Date.now()+shift*7*86400000);
 const todayKey=M.dayKey(Date.now());
 const src=priv.calendarSource||priv.source;
 const list=M.eventsOfDay(priv.events,sel);
 const counts=useMemo(()=>Object.fromEntries(week.map(d=>[d.key,M.eventsOfDay(priv.events,d.key).length])),[priv.events,week[0].key]);
 const move=d=>{haptic('select');const n=shift+d;setShift(n);setSel(n===0?todayKey:M.weekOf(Date.now()+n*7*86400000)[0].key);};
 return <div className="home">
  <Card className="span2 calHead">
   <SourceLine name="Календарь" src={src}/>
   <div className="weekNav"><button type="button" onClick={()=>move(-1)} aria-label="Предыдущая неделя">‹</button><b>{new Date(week[0].ts).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short'})} — {new Date(week[6].ts).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short'})}</b><button type="button" onClick={()=>move(1)} aria-label="Следующая неделя">›</button></div>
   <div className="week">{week.map(d=><button type="button" key={d.key} className={'day'+(d.key===sel?' active':'')+(d.key===todayKey?' today':'')} onClick={()=>{haptic('select');setSel(d.key);}} aria-pressed={d.key===sel}><small>{d.wd}</small><b>{d.num}</b><i>{counts[d.key]?'•'.repeat(Math.min(3,counts[d.key])):''}</i></button>)}</div>
   {shift!==0&&<button type="button" className="ghost" onClick={()=>{haptic('select');setShift(0);setSel(todayKey);}}>К сегодняшнему дню</button>}
  </Card>
  <Card title={M.dayTitle(sel)} aside={list.length?String(list.length):''} className="span2">
   {list.length?list.map(e=><EventItem key={e.id} e={e} onOpen={id=>openSheet({kind:'event',id})}/>):<Empty text={M.emptyDayText(src)}/>}
  </Card>
  <Card title="Типы событий" className="span2">
   <div className="chips">{Object.entries(M.EVENT_KINDS).filter(([k])=>k!=='other').map(([k,v])=><Chip key={k} tone={'k-'+k}>{v.title}</Chip>)}</div>
   <p className="empty">События скрыты в публичном ЦУПе. Подключение защищённого доступа ещё не настроено.</p>
  </Card>
 </div>;
}

// ---------- ПРОЕКТЫ ----------
function inProject(t,pid){
 if(!pid)return true;if(!t.project)return false;
 const find=(l)=>{for(const x of l){if(x.id===pid)return x;const r=x.children&&find(x.children);if(r)return r;}return null;};
 const node=find(projectTree);if(!node)return false;
 const ids=[];const walk=n=>{ids.push(n.id,n.name);(n.children||[]).forEach(walk);};walk(node);
 return ids.includes(t.project);
}
function TaskCard({t,onOpen,drag}){
 return <button type="button" className={'task'+(t.pending?.status||t.pending?.priority?' pending':'')} onClick={()=>{haptic('select');onOpen(t.id);}}
  draggable={drag?true:undefined} onDragStart={drag?e=>{e.dataTransfer.setData('text/plain',t.id);e.dataTransfer.effectAllowed='move';}:undefined}>
  {t.project&&<small className="proj">{projectName(t.project)}</small>}
  <b>{t.title}</b>
  <div className="chips"><Chip tone={'st-'+M.columnOf(t.status)}>{M.statusTitle(t.status)}</Chip>{t.priority&&<Chip tone={'pr-'+t.priority}>{M.priorityTitle(t.priority)}</Chip>}{t.deadline&&<Chip>срок {t.deadline}</Chip>}{t.owner&&<Chip>{t.owner}</Chip>}</div>
  {(t.pending?.status||t.pending?.priority)&&<small className="muted2">Изменено на этом устройстве · в реестр не записано</small>}
 </button>;
}
// Перетаскивание — только мышью на широком экране. На телефоне скролл никогда не двигает карточку: карточка → выбор.
const canDrag=()=>{try{return matchMedia('(pointer:fine)').matches;}catch(e){return false;}};
function DropZone({onDrop,className,children}){
 const [over,setOver]=useState(false);
 return <section className={className+(over?' over':'')} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);const id=e.dataTransfer.getData('text/plain');if(id)onDrop(id);}}>{children}</section>;
}
export function ProjectsScreen({s,priv,tasks,view,setView,project,openSheet,changeTask}){
 const list=tasks.filter(t=>inProject(t,project));
 const drag=canDrag();
 const node=useMemo(()=>{const f=l=>{for(const x of l){if(x.id===project)return x;const r=x.children&&f(x.children);if(r)return r;}return null;};return project?f(projectTree):null;},[project]);
 const boardRef=useRef(null);
 const taskSrc=priv.taskSource||priv.source;
 const connected=taskSrc.state!==M.SOURCE.NOT_CONNECTED;
 const open=id=>openSheet({kind:'task',id});
 let body;
 if(!connected)body=<Card className="span2"><Empty text="Реестр задач Штаба приватный и к этому экрану пока не подключён. Список, доска и приоритеты покажут одни и те же задачи, как только появится защищённый канал."/><p className="empty">Статусы берутся из реестра как есть и только группируются в колонки. Приоритет — отдельное измерение и хранится на этом устройстве, реестр не переписывается.</p></Card>;
 else if(!list.length)body=<Card className="span2"><Empty text={priv.taskMeta?.partial?'В безопасном срезе для этого направления активных задач нет. Это не подтверждает отсутствие приватных задач.':project?'В этом направлении задач по данным реестра нет':'Задач по данным реестра нет'}/></Card>;
 else if(view==='list'){const cols=M.boardColumns(list);body=<Card className="span2 taskList">{cols.filter(c=>c.tasks.length).map(c=><div key={c.id}><h4>{c.title} <span>{c.tasks.length}</span></h4>{c.tasks.map(t=><TaskCard key={t.id} t={t} onOpen={open}/>)}</div>)}</Card>;}
 else if(view==='board'){const cols=M.boardColumns(list);body=<div className="span2"><div className="board" ref={boardRef}>{cols.map(c=><DropZone key={c.id} className="col" onDrop={id=>changeTask(id,{status:M.codeForColumn(c.id)},true)}><div className="colHead"><b>{c.title}</b><span>{c.tasks.length}</span></div>{c.tasks.length?c.tasks.map(t=><TaskCard key={t.id} t={t} onOpen={open} drag={drag}/>):<p className="empty">Пусто</p>}</DropZone>)}</div><div className="boardDots">{cols.map(c=><button type="button" key={c.id} onClick={()=>{const el=boardRef.current?.children[cols.indexOf(c)];el?.scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'});}}>{c.title} · {c.tasks.length}</button>)}</div></div>;}
 else{const mx=M.matrix(list);body=<div className="span2"><div className="matrix">{mx.quads.map(q=><DropZone key={q.id} className={'quad pr-'+q.id} onDrop={id=>changeTask(id,{priority:q.id},true)}><div className="colHead"><b>{q.title}</b><span>{q.tasks.length}</span></div><small className="hint">{q.hint}</small>{q.tasks.map(t=><TaskCard key={t.id} t={t} onOpen={open} drag={drag}/>)}</DropZone>)}</div>
  {mx.unsorted.length>0&&<Card title="Не разобрано" aside={String(mx.unsorted.length)}>{mx.unsorted.map(t=><TaskCard key={t.id} t={t} onOpen={open} drag={drag}/>)}</Card>}
  <p className="empty">Приоритет не меняет статус. «Делегировать» не отправляет поручение само, «Отложить» не удаляет задачу.</p></div>;}
 return <div className="home">
  <div className="span2 projBar">
   <button type="button" className="picker" onClick={()=>{haptic('select');openSheet({kind:'project'});}}><small>Направление</small><b>{node?node.name:'Все проекты'}</b><i>▾</i></button>
   <Seg label="Представление задач" value={view} onChange={setView} items={[['list','Список'],['board','Доска'],['matrix','Приоритеты']]}/>
   <SourceLine name={priv.taskMeta?.partial?"Реестр задач · безопасный срез":"Реестр задач"} src={taskSrc} compact/>
   {priv.taskMeta?.partial&&<p className="empty">Показаны только разрешённые для общего ЦУПа направления. Источник статуса остаётся проектный TASKS; этот экран — производный обзор.</p>}
  </div>
  {node?.id==='rostok'&&<><Rostok r={s.rostok}/><ProofFlow runtime={s.artifactRuntime} mode={s.mode}/><Workflows list={s.workflows.filter(x=>/Росток|публикаци/i.test(x[0]))}/></>}
  {node?.id==='hq'&&<><Documents s={s}/><Workflows list={s.workflows}/></>}
  {body}
 </div>;
}
export function TaskSheet({t,changeTask}){
 return <>
  {t.project&&<p className="desc">{projectName(t.project)}</p>}
  <div className="chooser"><small>Статус · из реестра Штаба</small><div className="opts">{M.STATUS_COLUMNS.map(c=><button type="button" key={c.id} className={M.columnOf(t.status)===c.id?'active':''} onClick={()=>changeTask(t.id,{status:M.columnOf(t.status)===c.id?t.status:M.codeForColumn(c.id)})}>{c.title}</button>)}</div></div>
  <div className="chooser"><small>Приоритет · отдельно от статуса</small><div className="opts">{M.PRIORITIES.map(p=><button type="button" key={p.id} className={t.priority===p.id?'active':''} onClick={()=>changeTask(t.id,{priority:p.id})}>{p.title}</button>)}<button type="button" className={!t.priority?'active':''} onClick={()=>changeTask(t.id,{priority:null})}>Не разобрано</button></div></div>
  <Field k="Статус в реестре">{M.statusTitle(t.status)}</Field>
  <Field k="Срок">{t.deadline}</Field><Field k="Ответственный">{t.owner}</Field><Field k="Источник">{t.source}</Field>
  <p className="empty">Изменения сохраняются на этом устройстве и помечаются «в реестр не записано». Проектные TASKS остаются источником истины. Встречи в календаре от этого не переносятся.</p>
 </>;
}
export function ProjectPicker({path,setPath,project,pick}){
 let nodes=projectTree,node=null;
 for(const id of path){node=nodes.find(x=>x.id===id);if(!node){nodes=[];break;}nodes=node.children||[];}
 return <>
  {path.length>0&&<button type="button" className="back" onClick={()=>{haptic('light');setPath(path.slice(0,-1));}}>‹ {path.length>1?'Назад':'Все направления'}</button>}
  {node?<button type="button" className={'project'+(project===node.id?' active':'')} onClick={()=>pick(node.id)}><span className="num">✓</span><div><b>Выбрать «{node.name}»</b><small>{node.desc}</small></div><i/></button>
   :<button type="button" className={'project'+(!project?' active':'')} onClick={()=>pick(null)}><span className="num">✓</span><div><b>Все проекты</b><small>Задачи всех направлений</small></div><i/></button>}
  {nodes.map((x,i)=><button type="button" className={'project'+(project===x.id?' active':'')} key={x.id} onClick={()=>{haptic('select');x.children?.length?setPath([...path,x.id]):pick(x.id);}}><span className="num">{String(i+1).padStart(2,'0')}</span><div><b>{x.name}</b><small>{x.desc||''}</small></div><i>{x.children?.length?'›':''}</i></button>)}
 </>;
}

// ---------- СИСТЕМЫ · ЖИВАЯ СХЕМА ----------
export function SchemeCard({graph,selected,onSelect}){
 const html=useMemo(()=>schemeSVG(graph,{selected}),[graph,selected]);
 const onClick=e=>{const g=e.target.closest('[data-node]');if(g){haptic('select');onSelect(g.dataset.node);}};
 const onKey=e=>{if((e.key==='Enter'||e.key===' ')&&e.target.dataset?.node){e.preventDefault();onSelect(e.target.dataset.node);}};
 const c=graph.counts;
 return <Card title="Живая схема Штаба" aside={graph.known?(c.err?c.err+' ошибк'+(c.err===1?'а':'и'):c.wait?c.wait+' с вниманием':'связи штатно'):'нет данных'} className="span2 hud schemeCard">
  <div className="schemeWrap" onClick={onClick} onKeyDown={onKey} dangerouslySetInnerHTML={{__html:html}}/>
  <div className="legend"><span><i className="dot ok"/>штатно · {c.ok}</span><span><i className="dot wait"/>внимание · {c.wait}</span><span><i className="dot err"/>ошибка · {c.err}</span><span><i className="dot none"/>не подтверждено · {c.none}</span></div>
  <small className="since">{graph.known?'Импульс идёт только по работающим участкам свежего снимка. Нажми на узел — откроется его карточка.':'Состояние узлов не подтверждено: нет свежего снимка.'}</small>
 </Card>;
}
const NAV={calendar:['calendar','Открыть календарь'],projects:['projects','Открыть проекты'],documents:['documents','Открыть документы'],workflows:['workflows','Открыть процессы'],rostok:['rostok','Открыть проект'],inbox:['inbox','Открыть входящие']};
export function NodeSheet({n,asOf,navigate}){
 const nav=n.nav&&NAV[n.nav];
 return <>
  <div className={'nodeState '+n.level}><span className={'dot '+n.level}/><b>{M.levelLabel(n.level)}</b>{n.stale&&<Chip tone="wait">последний снимок</Chip>}</div>
  <Field k="Последнее обновление">{asOf&&n.level!=='none'?moscowTime(asOf,true)+' МСК':'не подтверждено'}</Field>
  <Field k="Что сейчас происходит">{n.detail}</Field>
  {n.issue&&<Field k="Проблема">{n.issue.text}</Field>}
  {n.issue?.action&&<Field k="Следующее действие"><span className="act">{n.issue.action}</span></Field>}
  <Field k="Связанные проекты">{n.related.join(' · ')}</Field>
  <Field k="Задачи и документы">Связи узла с задачами и документами появятся после подключения приватного реестра</Field>
  {nav&&<button type="button" className="primary" onClick={()=>navigate(nav[0])}>{nav[1]}</button>}
 </>;
}
export function SystemsScreen({s,graph,selected,onSelect}){
 const bad=s.systems.filter(x=>x[1]!=='ok');
 return <div className="home">
  <SchemeCard graph={graph} selected={selected} onSelect={onSelect}/>
  <HarnessCard s={s}/>
  <ProofFlow runtime={s.artifactRuntime} mode={s.mode}/>
  <Signals s={s} title="Что требует решения" className="span2"/>
  <Documents s={s}/>
  <Workflows id="workflows" list={s.workflows}/>
  <Rostok r={s.rostok}/>
  <Card title="Все системы" aside={s.systems.length?(bad.length?bad.length+' с сигналом':'штатно'):''}>{s.systems.length?s.systems.map((x,i)=><Row key={i} dot={x[1]} title={x[0]} text={x[2]}/>):<Empty text="Ждём первое обновление состояния"/>}</Card>
 </div>;
}

// ---------- ВХОДЯЩИЕ ----------
function InboxActivity({summary}){
 if(!summary)return null;
 const labels={max:'MAX',telegram:'Telegram'};
 const rows=Object.entries(summary.channels||{});
 return <Card title="Активность каналов" aside={rows.length?'реальные журналы':''} className="span2">
  {rows.length?rows.map(([key,x])=><Row key={key} dot={!x.readOk?'wait':x.attentionCount>0?'wait':'ok'} title={labels[key]||key}
   text={[x.last24h!=null?'за 24 ч: '+x.last24h:null,x.attentionCount>0?'требуют внимания: '+x.attentionCount:null,x.total!=null?'всего записей: '+x.total:null,x.lastMessageAt?'последняя: '+moscowTime(x.lastMessageAt,true)+' МСК':null].filter(Boolean).join(' · ')}/>)
   :<Empty text="Агрегаты входящих пока не получены"/>}
  <p className="empty">Это активность получателей, а не список поручений: текст сообщений и идентификаторы пользователей в общую телеметрию не передаются.</p>
 </Card>;
}
export function InboxScreen({s,priv,openSheet}){
 const items=M.unprocessed(priv.inbox);
 const inboxSrc=priv.inboxSource||priv.source;
 const connected=inboxSrc.state!==M.SOURCE.NOT_CONNECTED;
 return <div className="home">
  <InboxActivity summary={priv.inboxSummary}/>
  <Card title="Не разобрано" aside={connected?String(items.length):''} className="span2">
   <SourceLine name="Входящие" src={inboxSrc} compact/>
   {!connected?<Empty text={priv.inboxSummary?'Реальная активность каналов подключена, но карточки сообщений остаются в защищённом слое и пока не передаются в ЦУП.':'Карточки входящих приходят через приватный канал, он ещё не подключён.'}/>
    :items.length?items.map(x=><button type="button" key={x.id} className="inboxItem" onClick={()=>{haptic('select');openSheet({kind:'inbox',id:x.id});}}><span className={'dot '+(x.triage==='new'?'wait':'ok')}/><div><b>{x.summary||x.type}</b><small>{[x.channel,x.receivedAt&&moscowTime(x.receivedAt,true),x.type,x.project&&projectName(x.project)].filter(Boolean).join(' · ')}</small></div><Chip>{x.triage==='new'?'новое':'связано'}</Chip></button>)
    :<Empty text={M.confirmsAbsence(inboxSrc)?'Всё разобрано по данным источника':'Нет подтверждённых данных'}/>}
  </Card>
  <Card title="Получатели сообщений" className="span2">
   {channelViews(s).map(c=><Row key={c.id} dot={c.level} title={c.title} text={c.detail}/>)}
   <p className="empty">Прочитано ботом — ещё не значит разобрано.</p>
  </Card>
 </div>;
}
export function InboxSheet({x}){
 const acts=['Превратить в задачу','Создать событие','Связать с проектом','Связать с документом','Отметить разобранным'];
 return <>
  <Field k="Канал">{x.channel}</Field><Field k="Получено">{x.receivedAt&&moscowTime(x.receivedAt,true)}</Field><Field k="Тип">{x.type}</Field><Field k="Проект">{x.project&&projectName(x.project)}</Field>
  <div className="opts col">{acts.map(a=><button type="button" key={a} disabled>{a}</button>)}</div>
  <p className="empty">Действия станут доступны после подключения защищённого канала записи. Сейчас они ничего не меняют, поэтому выключены.</p>
 </>;
}
