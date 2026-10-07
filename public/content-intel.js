// Контент-разведка · безопасный публичный снимок без токенов и приватных данных.
export const INTEL_URLS=[
 'https://raw.githubusercontent.com/Daridarom/shtab-tochka/telemetry/live/content-intel.json',
 'https://raw.githubusercontent.com/Daridarom/shtab-tochka/main/live/content-intel.json'
];
export const INTEL_CACHE_SECONDS=300;

const text=(v,n=500)=>String(v??'').trim().slice(0,n);
const num=v=>Number.isFinite(v)?v:null;
const arr=(v,n=12)=>Array.isArray(v)?v.filter(x=>typeof x==='string').slice(0,n):[];
const allowedPlatform=new Set(['youtube','instagram','tiktok']);
const allowedStatus=new Set(['new','review','ready','published','rejected']);

export function normalizeContentIntel(raw){
 if(!raw||raw.schema!=='content-intel-1'||raw.visibility!=='public'||!raw.generated_at||!Array.isArray(raw.items))return null;
 const items=raw.items.map((x,i)=>{
  if(!x||!x.id||!x.title||!x.url)return null;
  const platform=allowedPlatform.has(x.platform)?x.platform:'youtube';
  const metrics=x.metrics&&typeof x.metrics==='object'?x.metrics:{};
  const analysis=x.analysis&&typeof x.analysis==='object'?x.analysis:{};
  return {
   id:text(x.id,120),
   platform,
   title:text(x.title,300),
   author:text(x.author,120),
   url:text(x.url,700),
   published_at:x.published_at||null,
   priority:num(x.priority),
   status:allowedStatus.has(x.status)?x.status:'new',
   metrics:{
    views:num(metrics.views),likes:num(metrics.likes),comments:num(metrics.comments),
    vph:num(metrics.vph),outlier:num(metrics.outlier),followers:num(metrics.followers)
   },
   topics:arr(x.topics,10),
   projects:arr(x.projects,8),
   hook:text(x.hook,600),
   concept:text(x.concept,900),
   format:text(x.format,500),
   why:text(x.why,900),
   risk:text(x.risk,600),
   analysis:{
    status:text(analysis.status,80)||'not_started',
    transcript_status:text(analysis.transcript_status,80)||'not_started',
    angle:text(analysis.angle,900),
    reaction_idea:text(analysis.reaction_idea,900)
   },
   source:text(x.source,120)||'manual'
  };
 }).filter(Boolean);
 return {
  schema:'content-intel-1',
  visibility:'public',
  generated_at:raw.generated_at,
  ttl_seconds:Number.isFinite(raw.ttl_seconds)?raw.ttl_seconds:21600,
  query_note:text(raw.query_note,1000),
  items,
  meta:{
   credits_remaining:num(raw.meta?.credits_remaining),
   source:text(raw.meta?.source,120)||'AI Штаб',
   coverage:arr(raw.meta?.coverage,10)
  }
 };
}

export async function fetchContentIntel(urls=INTEL_URLS){
 const hits=await Promise.all(urls.map(async url=>{
  try{
   const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)return null;
   const raw=normalizeContentIntel(await r.json());
   if(!raw)return null;
   const ts=Date.parse(raw.generated_at);
   const source=url.includes('/telemetry/')?'telemetry-branch':url.includes('/main/')?'main-branch':'site-snapshot';
   return {raw,ts:Number.isFinite(ts)?ts:0,source};
  }catch(e){return null;}
 }));
 return hits.filter(Boolean).sort((a,b)=>b.ts-a.ts)[0]||null;
}

export function intelFreshness(snapshot,now=Date.now()){
 if(!snapshot)return {state:'offline',label:'Нет снимка',age:null};
 const ts=Date.parse(snapshot.generated_at);
 if(!Number.isFinite(ts))return {state:'offline',label:'Время неизвестно',age:null};
 const age=Math.max(0,Math.round((now-ts)/1000));
 const stale=age>(snapshot.ttl_seconds||21600)+INTEL_CACHE_SECONDS;
 const fmt=age<60?'только что':age<3600?Math.round(age/60)+' мин назад':age<86400?Math.round(age/3600)+' ч назад':Math.round(age/86400)+' дн назад';
 return {state:stale?'stale':'live',label:(stale?'Последний снимок · ':'Обновлено ')+fmt,age};
}
