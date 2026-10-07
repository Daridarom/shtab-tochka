import {useEffect,useMemo,useState} from 'react';
import {Card,Chip,Empty,openExternal} from './ui.jsx';
import {fetchContentIntel,intelFreshness,INTEL_URLS} from '../../public/content-intel.js';
import {haptic} from './max.js';

const CACHE_KEY='shtab.contentIntel.snapshot.v1';
const QUEUE_KEY='shtab.contentIntel.queue.v1';

function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch(e){return fallback;}}
function writeJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}}
function n(v){return Number.isFinite(v)?new Intl.NumberFormat('ru-RU',{notation:v>=1000000?'compact':'standard',maximumFractionDigits:v>=1000000?1:0}).format(v):'—';}
function platformLabel(p){return ({youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok'})[p]||p;}
function tone(score){return score>=90?'hot':score>=80?'warm':'normal';}
function metric(label,value){return <div className="intelMetric"><small>{label}</small><b>{value}</b></div>;}

export function ContentIntelScreen(){
 const [snapshot,setSnapshot]=useState(()=>readJSON(CACHE_KEY,null));
 const [source,setSource]=useState(snapshot?'cache':null);
 const [loading,setLoading]=useState(!snapshot);
 const [filter,setFilter]=useState('all');
 const [project,setProject]=useState('all');
 const [queue,setQueue]=useState(()=>readJSON(QUEUE_KEY,{}));

 const refresh=async()=>{
  setLoading(true);
  try{
   const local=typeof location!=='undefined'?new URL('../live/content-intel.json',location.href).href:null;
   const hit=await fetchContentIntel(local?[local,...INTEL_URLS]:INTEL_URLS);
   if(hit?.raw){setSnapshot(hit.raw);setSource(hit.source);writeJSON(CACHE_KEY,hit.raw);}
  }finally{setLoading(false);}
 };
 useEffect(()=>{refresh();const id=setInterval(refresh,5*60*1000);return()=>clearInterval(id);},[]);

 const fresh=intelFreshness(snapshot);
 const projects=useMemo(()=>{
  const all=new Set();
  for(const x of snapshot?.items||[])for(const p of x.projects||[])all.add(p);
  return ['all',...Array.from(all)];
 },[snapshot]);
 const items=useMemo(()=>{
  let list=snapshot?.items||[];
  if(filter==='hot')list=list.filter(x=>(x.priority??0)>=90);
  if(filter==='queue')list=list.filter(x=>queue[x.id]);
  if(project!=='all')list=list.filter(x=>x.projects.includes(project));
  return [...list].sort((a,b)=>(b.priority??0)-(a.priority??0));
 },[snapshot,filter,project,queue]);
 const hot=(snapshot?.items||[]).filter(x=>(x.priority??0)>=90).length;
 const queued=Object.values(queue).filter(Boolean).length;

 const toggleQueue=id=>{
  haptic('select');
  setQueue(q=>{const next={...q,[id]:!q[id]};writeJSON(QUEUE_KEY,next);return next;});
 };

 return <main className="intel">
  <Card title="Радар контента" aside={fresh.label} className="intelHero">
   <p className="desc">Ищем не просто большие просмотры, а ранние сигналы: скорость роста, аномальный результат относительно канала и пригодность сюжета для наших направлений.</p>
   <div className="intelOverview">
    {metric('Кандидатов',snapshot?.items?.length??'—')}
    {metric('Высокий приоритет',hot||'—')}
    {metric('В разборе',queued||'—')}
    {metric('Источник',source==='telemetry-branch'?'живой радар':source==='main-branch'?'снимок GitHub':source==='site-snapshot'?'снимок сайта':source==='cache'?'кэш устройства':'—')}
   </div>
   <div className={'intelSource '+fresh.state}><span className={'dot '+(fresh.state==='live'?'ok':fresh.state==='stale'?'wait':'none')}/><div><b>{loading?'Обновляем разведку…':fresh.label}</b><small>{snapshot?.meta?.coverage?.length?snapshot.meta.coverage.join(' · '):'YouTube · Instagram · TikTok'}</small></div></div>
  </Card>

  <Card title="Отбор" aside={items.length+' показано'}>
   <div className="intelSeg">
    {[['all','Все'],['hot','🔥 Срочно'],['queue','В разборе']].map(([id,label])=><button type="button" key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}
   </div>
   <div className="intelProjectBar">
    {projects.map(p=><button type="button" key={p} className={project===p?'active':''} onClick={()=>setProject(p)}>{p==='all'?'Все направления':p}</button>)}
   </div>
  </Card>

  {!snapshot&&<Card title="Контент-разведка"><Empty text="Снимок ещё не подключён. После первого импорта здесь появятся найденные ролики и метрики."/></Card>}

  <section className="intelFeed">
   {items.map(x=><article className={'intelItem '+tone(x.priority??0)} key={x.id}>
    <div className="intelTop">
     <div><small className="intelPlatform">{platformLabel(x.platform)} · {x.author||'автор'}</small><h3>{x.title}</h3></div>
     <div className="intelScore"><b>{x.priority??'—'}</b><small>приоритет</small></div>
    </div>
    <div className="intelMetrics">
     {metric('Просмотры',n(x.metrics.views))}
     {metric('VPH',n(x.metrics.vph))}
     {metric('Выброс',x.metrics.outlier!=null?'×'+Number(x.metrics.outlier).toFixed(x.metrics.outlier>=100?0:1):'—')}
     {metric('Реакции',x.metrics.likes!=null?n(x.metrics.likes):x.metrics.comments!=null?n(x.metrics.comments):'—')}
    </div>
    {x.hook&&<div className="intelCallout"><small>Первые секунды</small><b>{x.hook}</b></div>}
    {x.why&&<p className="intelWhy">{x.why}</p>}
    <div className="chips">{x.projects.map(p=><Chip key={p}>{p}</Chip>)}{x.analysis.transcript_status==='ready'&&<Chip tone="st-done">транскрипт готов</Chip>}{x.analysis.transcript_status!=='ready'&&<Chip tone="st-wait">нужен транскрипт</Chip>}</div>
    {(x.analysis.reaction_idea||x.analysis.angle||x.risk)&&<details className="intelDetails"><summary>Разбор и идея реакции</summary>
     {x.analysis.angle&&<div><small>Наш угол</small><p>{x.analysis.angle}</p></div>}
     {x.analysis.reaction_idea&&<div><small>Формат</small><p>{x.analysis.reaction_idea}</p></div>}
     {x.risk&&<div><small>Проверить</small><p>{x.risk}</p></div>}
    </details>}
    <div className="intelActions">
     <button type="button" className="ghost" onClick={()=>openExternal(x.url)}>Открыть оригинал</button>
     <button type="button" className={queue[x.id]?'primary queued':'primary'} onClick={()=>toggleQueue(x.id)}>{queue[x.id]?'✓ В разборе':'Поставить в разбор'}</button>
    </div>
   </article>)}
  </section>

  <Card title="Рабочий контур" aside="MVP">
   <div className="intelFlow">{['Найти','Отобрать','Транскрибировать','Проверить факты','Сделать наш угол','Сценарий'].map((x,i)=><div key={x}><small>{String(i+1).padStart(2,'0')}</small><b>{x}</b></div>)}</div>
   <p className="desc">Кнопка «В разборе» пока хранится на этом устройстве, как и локальные правки задач ЦУПа. Публичный снимок содержит только открытые ссылки и метрики; токены и приватные данные в браузер не попадают.</p>
  </Card>
 </main>;
}
