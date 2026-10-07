import {useEffect,useRef,useState,useCallback,useMemo} from 'react';
import {Panel,Typography} from '@maxhub/max-ui';
import {startLive,moscowTime} from '../../public/live.js';
import {normalizeMaxState} from '../../public/section-state.js';
import {projectTree} from '../../public/projects.js';
import * as M from '../../public/model.js';
import {haptic,useBackButton} from './max.js';
import {startStarfield} from '../../public/starfield.js';
import {Sheet} from './ui.jsx';
import {Today,CalendarScreen,ProjectsScreen,SystemsScreen,InboxScreen,EventSheet,TaskSheet,ProjectPicker,NodeSheet,InboxSheet} from './screens.jsx';
import {ContentIntelScreen} from './content-intel.jsx';

const TABS=[['home','Сегодня'],['calendar','Календарь'],['projects','Проекты'],['intel','Радар','Контент-разведка'],['systems','Системы'],['inbox','Входящие']];
const store={get(k,d){try{return localStorage.getItem(k)??d;}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,v);}catch(e){}},json(k,d){try{const v=JSON.parse(localStorage.getItem(k)||'null');return v??d;}catch(e){return d;}}};
const initial={mode:'loading',verdict:null,notice:null,cards:[],metrics:{active:null,total:null,attention:null,done:null,dailyLimit:null,nextSlotLabel:null,problems:null,oldest:null},focus:[],systems:[],workflows:[],events:[],inbox:[],rostok:null,artifactRuntime:null,taskSummary:null,inboxSummary:null,calendar:null,ageSeconds:null,asOf:null,loadedAt:Date.now()};
const CHANGES_KEY='shtab.max.taskChanges.v1';

function Starfield({theme}){const ref=useRef(null);useEffect(()=>{const h=startStarfield(ref.current,{theme});return()=>h.stop();},[theme]);return <canvas ref={ref} className="stars" aria-hidden="true"/>;}
function ThemeIcon({setting}){
 if(setting==='light')return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
 if(setting==='dark')return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>;
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>;
}
function RefreshIcon(){return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>;}

// Защищённый слой. Приватного канала пока нет — возвращаем «не подключён», без имитации синхронизации.
// Только в режиме разработки можно подставить тестовый снимок через window.__SHTAB_PRIVATE__ (в сборку не попадает).
function usePrivate(s){
 return useMemo(()=>{
  const base=import.meta.env.DEV&&typeof window!=='undefined'&&window.__SHTAB_PRIVATE__
   ?M.fromPrivateSnapshot(window.__SHTAB_PRIVATE__)
   :M.emptyPrivate();
  const cal=M.fromPublicCalendar(s?.calendar);
  const pubTasks=M.fromPublicTasks(s?.taskSummary);
  const inboxSummary=M.fromInboxSummary(s?.inboxSummary);
  const hasPrivateTasks=(base.taskSource||base.source).state!==M.SOURCE.NOT_CONNECTED;
  const hasPrivateInbox=(base.inboxSource||base.source).state!==M.SOURCE.NOT_CONNECTED;
  return {
   ...base,
   calendarSource:cal?.source||base.calendarSource||base.source,
   events:cal?.events||base.events,
   taskSource:hasPrivateTasks?(base.taskSource||base.source):(pubTasks?.source||base.taskSource||base.source),
   tasks:hasPrivateTasks?base.tasks:(pubTasks?.tasks||base.tasks),
   taskMeta:hasPrivateTasks?{partial:false}:(pubTasks?.meta||{partial:true}),
   inboxSource:base.inboxSource||base.source,
   inboxSummarySource:inboxSummary?.source||null,
   inboxSummary:inboxSummary||null,
   inbox:hasPrivateInbox?base.inbox:base.inbox
  };
 },[s?.calendar,s?.taskSummary,s?.inboxSummary]);
}
function findProject(id){const f=l=>{for(const x of l){if(x.id===id)return x;const r=x.children&&f(x.children);if(r)return r;}return null;};return id?f(projectTree):null;}

export default function App({scheme='dark',themeSetting='dark',cycleTheme=()=>{}}){
 const [s,setS]=useState(initial);
 const [tab,setTabState]=useState(()=>TABS.some(t=>t[0]===store.get('shtab.max.tab'))?store.get('shtab.max.tab'):'home');
 const [busy,setBusy]=useState(false);
 const [,setTick]=useState(0);
 const [sheet,setSheet]=useState(null);
 const [pickerPath,setPickerPath]=useState([]);
 const [node,setNode]=useState(null);
 const [view,setViewState]=useState(()=>['list','board','matrix'].includes(store.get('shtab.max.view'))?store.get('shtab.max.view'):'list');
 const [project,setProjectState]=useState(()=>{const p=store.get('shtab.max.project','');return findProject(p)?p:null;});
 const [changes,setChanges]=useState(()=>{const c=store.json(CHANGES_KEY,{});return c&&typeof c==='object'&&!Array.isArray(c)?c:{};});
 const live=useRef(null);
 const priv=usePrivate(s);
 useEffect(()=>{live.current=startLive(d=>setS({...normalizeMaxState(d),loadedAt:Date.now()}));const id=setInterval(()=>setTick(t=>t+1),1000);return()=>{live.current?.stop();clearInterval(id);};},[]);
 const tasks=useMemo(()=>M.applyChanges(priv.tasks,changes),[priv.tasks,changes]);
 const graph=useMemo(()=>M.schemeGraph(s,priv),[s,priv]);

 const setTab=useCallback(id=>{haptic('select');setSheet(null);setTabState(id);store.set('shtab.max.tab',id);try{scrollTo({top:0});}catch(e){}},[]);
 const setView=v=>{setViewState(v);store.set('shtab.max.view',v);};
 const setProject=p=>{setProjectState(p);store.set('shtab.max.project',p||'');};
 const openSheet=useCallback(x=>{if(x.kind==='project')setPickerPath([]);setSheet(x);},[]);
 const closeSheet=useCallback(()=>{haptic('light');setSheet(null);if(sheet?.kind==='node')setNode(null);},[sheet]);
 const changeTask=useCallback((id,patch,fromDrag)=>{haptic(fromDrag?'light':'select');setChanges(c=>{const n=M.setTaskChange(c,id,patch);store.set(CHANGES_KEY,JSON.stringify(n));return n;});},[]);

 // Кнопка «Назад» MAX: сначала шаг назад в выборе проекта, затем закрыть карточку, затем снять фильтр проекта.
 const back=useCallback(()=>{
  if(sheet?.kind==='project'&&pickerPath.length){haptic('light');setPickerPath(p=>p.slice(0,-1));return;}
  if(sheet){closeSheet();return;}
  if(tab==='projects'&&project){haptic('light');setProject(null);}
 },[sheet,pickerPath,closeSheet,tab,project]);
 useBackButton(!!sheet||(tab==='projects'&&!!project),back);

 const navigate=useCallback(to=>{
  setSheet(null);setNode(null);
  if(to==='documents'||to==='workflows'){setTab('systems');setTimeout(()=>{try{document.getElementById(to)?.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){}},60);return;}
  if(to==='rostok'){setProject('rostok');setTab('projects');return;}
  setTab(to);
 },[setTab]);
 const selectNode=id=>{setNode(id);setSheet({kind:'node',id});};

 const onRefresh=async()=>{if(busy)return;haptic('light');setBusy(true);try{await live.current?.refresh();}finally{setBusy(false);}};
 const age=s.ageSeconds==null?null:s.ageSeconds+Math.max(0,Math.round((Date.now()-s.loadedAt)/1000));
 const freshness=M.operationalFreshness(s,priv,age);
 const status=s.mode==='loading'
  ?'Обновляем…'
  :freshness.label+(s.asOf?' · штаб '+moscowTime(s.asOf):'');
 const unprocessed=M.unprocessed(priv.inbox).length;

 let sheetView=null;
 if(sheet){
  if(sheet.kind==='event'){const e=priv.events.find(x=>x.id===sheet.id);if(e)sheetView=<Sheet title={e.title} onClose={closeSheet}><EventSheet e={e}/></Sheet>;}
  else if(sheet.kind==='task'){const t=tasks.find(x=>x.id===sheet.id);if(t)sheetView=<Sheet title={t.title} onClose={closeSheet}><TaskSheet t={t} changeTask={changeTask}/></Sheet>;}
  else if(sheet.kind==='project')sheetView=<Sheet title="Направление" onClose={closeSheet}><ProjectPicker path={pickerPath} setPath={setPickerPath} project={project} pick={p=>{haptic('select');setProject(p);setSheet(null);}}/></Sheet>;
  else if(sheet.kind==='node'){const n=graph.nodes.find(x=>x.id===sheet.id);if(n)sheetView=<Sheet title={n.title} onClose={closeSheet}><NodeSheet n={n} asOf={graph.asOf} navigate={navigate}/></Sheet>;}
  else if(sheet.kind==='inbox'){const x=priv.inbox.find(i=>i.id===sheet.id);if(x)sheetView=<Sheet title={x.summary||x.type} onClose={closeSheet}><InboxSheet x={x}/></Sheet>;}
 }

 return <><Starfield theme={scheme}/><Panel mode="secondary" className={'shell mode-'+s.mode}>
  <header className="top">
   <div><Typography.Label variant="small" className="eyebrow">ШТАБ.ТОЧКА · MAX</Typography.Label><Typography.Title variant="large-strong" className="title">{TABS.find(t=>t[0]===tab)?.[2]||TABS.find(t=>t[0]===tab)?.[1]}</Typography.Title><small className={'status '+s.mode}>{status}</small></div>
   <div className="tools"><button type="button" className="theme" onClick={()=>{haptic('select');cycleTheme();}} aria-label={'Тема: '+({dark:'тёмная',light:'светлая',auto:'как в MAX'})[themeSetting]} title={'Тема: '+({dark:'тёмная',light:'светлая',auto:'как в MAX'})[themeSetting]}><ThemeIcon setting={themeSetting}/></button><button type="button" className={'refresh'+(busy||s.mode==='loading'?' spin':'')} onClick={onRefresh} aria-label="Обновить"><RefreshIcon/></button></div>
  </header>
  {s.notice&&<div className={'notice '+s.notice.level}>{s.notice.text}</div>}
  {tab==='home'&&<Today s={s} priv={priv} go={setTab} openSheet={openSheet} age={age}/>}
  {tab==='calendar'&&<CalendarScreen priv={priv} openSheet={openSheet}/>}
  {tab==='projects'&&<ProjectsScreen s={s} priv={priv} tasks={tasks} view={view} setView={setView} project={project} openSheet={openSheet} changeTask={changeTask}/>}
  {tab==='intel'&&<ContentIntelScreen/>}
  {tab==='systems'&&<SystemsScreen s={s} graph={graph} selected={node} onSelect={selectNode}/>}
  {tab==='inbox'&&<InboxScreen s={s} priv={priv} openSheet={openSheet}/>}
  </Panel>
  <nav>{TABS.map(([id,t])=><button type="button" className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)} key={id}>{t}{id==='systems'&&s.focus.length>0&&<em className={'badge '+(s.focus.some(f=>f.level==='err')?'err':'wait')}>{s.focus.length}</em>}{id==='inbox'&&unprocessed>0&&<em className="badge">{unprocessed}</em>}</button>)}</nav>
  {sheetView}
 </>;
}
