import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../public/'+name,import.meta.url),'utf8')).toString('base64'));
const live=await load('live.js'), model=await load('model.js');
const generated_at='2026-10-01T10:00:00Z',now=Date.parse(generated_at);
test('hidden calendar never confirms absence or renders supplied details',()=>{
 for(const source_status of ['available','empty','unavailable']){
  const raw=live.normalizeCalendar({schema:'calendar-1',generated_at,visibility:'private',detail_available:false,
      source_status,events:[{id:'sentinel',title:'INTERNAL_SENTINEL',start:generated_at}]});
  const cal=model.fromPublicCalendar(raw,now);
  assert.equal(raw.events.length,0);assert.equal(cal.events.length,0);
  assert.equal(model.confirmsAbsence(cal.source),false);assert.match(cal.source.reason,/скрыты/);
 }
});
test('hidden tasks are incomplete and never render supplied details',()=>{
 const raw=live.normalizeTaskSummary({schema:'tasks-public-1',generated_at,visibility:'private',detail_available:false,
       items:[{id:'sentinel',title:'INTERNAL_SENTINEL'}]});
 const tasks=model.fromPublicTasks(raw,now);
 assert.equal(raw.items.length,0);assert.equal(tasks.tasks.length,0);assert.equal(model.confirmsAbsence(tasks.source),false);
});
test('aggregate warning never invents delivery failures or service stoppages',()=>{
 for(const id of ['publications','telegram','max','queue']){
  const state=live.toState({generated_at,visibility:'public_aggregates',detail_available:false,
      cards:[{id,level:'warn',detail:'Требует внимания'}]},now);
  assert.equal(state.focus[0].text,'Требует внимания');
  assert.doesNotMatch(state.focus[0].text,/доставк|не работает|потеряна/);
 }
});
test('public fetch rejects old unsanitized fallback payloads',async()=>{
 const prior=globalThis.fetch;
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>({schema:'calendar-1',generated_at,events:[{title:'INTERNAL_SENTINEL'}],cards:[]})});
  assert.equal(await live.fetchLive(['https://example.invalid/main']),null);
  assert.equal(await live.fetchCalendar(['https://example.invalid/main']),null);
 }finally{globalThis.fetch=prior;}
});
test('old browser cache is discarded before first render',()=>{
 const prior=globalThis.localStorage;
 const store=new Map([['shtab.lastState.v1',JSON.stringify({raw:{generated_at,cards:[{id:'system',detail:'INTERNAL_SENTINEL'}]}})],
      ['shtab.lastCalendar.v1',JSON.stringify({raw:{generated_at,events:[{title:'INTERNAL_SENTINEL'}]}})]]);
 globalThis.localStorage={getItem:k=>store.get(k)||null,removeItem:k=>store.delete(k),setItem:(k,v)=>store.set(k,v)};
 try{assert.equal(live.cachedState(now),null);assert.equal(store.has('shtab.lastState.v1'),false);}
 finally{globalThis.localStorage=prior;}
});
