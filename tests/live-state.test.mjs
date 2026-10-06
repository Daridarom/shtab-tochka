import assert from 'node:assert/strict';
import './privacy.test.mjs';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/live.js',import.meta.url),'utf8');
const {toState,normalizeCalendar,normalizeTaskSummary,normalizeInboxSummary}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const raw={generated_at:'2026-09-28T05:35:00Z',cards:[
 {id:'system',level:'ok',detail:'Канал управления: работает · процессы: работает · свободно 209 ГБ'},
 {id:'visual',level:'error',detail:'2 сервисов в состоянии ошибки'},
 {id:'publications',level:'ok',detail:'Неясная доставка: 0 · ошибки доставки: 0'}
],workflows:[],rostok:{published_today:0,daily_limit:4,queue:2,next_slot:'2026-09-28T09:00:00+03:00',total_published:53,unresolved:0}};
const s=toState(raw,Date.parse('2026-09-28T05:36:00Z'));
assert.equal(s.focus.length,1);
assert.equal(s.focus[0].level,'err');
assert.match(s.focus[0].text,/2 задачи.*с ошибкой/);
assert.doesNotMatch(s.focus[0].action,/reset-failed|Сброс/);
assert.equal(s.rostok.statusLabel,'есть готовые посты');
const blocked=structuredClone(raw);
blocked.cards[2].level='error';
blocked.cards[2].detail='Проверки: publication_lock_hold';
assert.equal(toState(blocked).rostok.statusLabel,'требует проверки');
const empty=structuredClone(raw);empty.rostok.queue=0;
assert.equal(toState(empty).rostok.statusLabel,'нет готовых постов');
const unknown=structuredClone(raw);unknown.cards.pop();
assert.equal(toState(unknown).rostok.statusLabel,'требует проверки');
console.log('PASS: rejected visuals remain visible; publication labels respect blockers, empty queue and unknown state');

const sectionSource=await readFile(new URL('../public/section-state.js',import.meta.url),'utf8');
const {documentView,normalizeMaxState,channelViews}=await import('data:text/javascript;base64,'+Buffer.from(sectionSource).toString('base64'));
const original={mode:'live',asOf:'2026-09-28T17:33:57Z',cards:[{id:'drive',level:'wait',detail:'Контекст проверен · Облачная копия индекса задач ожидает обновления'},{id:'max',level:'ok',detail:'Получатель: работает · записей: 518'}],focus:[{key:'drive',level:'wait',text:'Свежесть документов пока не подтверждена',since:123},{key:'visual',level:'err',text:'Ошибка'}]};
const docs=documentView(original);
assert.equal(docs.level,'wait');assert.match(docs.title,/индекс задач/);assert.match(docs.context,/подтверждает/);assert.match(docs.originals,/не проверяется/);
const mapped=normalizeMaxState(original);
assert.equal(mapped.focus[0].text,original.cards[0].detail);assert.equal(mapped.focus[0].level,'wait');assert.equal(mapped.focus[0].since,123);assert.deepEqual(mapped.focus[1],original.focus[1]);assert.equal(original.focus[0].text,'Свежесть документов пока не подтверждена');
const green=documentView({...original,cards:[{id:'drive',level:'ok',detail:'Контекст проверен'}]});
assert.equal(green.level,'ok');assert.match(green.originals,/не проверяется/);
const offline=documentView({...original,mode:'offline'});assert.equal(offline.available,false);assert.equal(offline.level,'wait');assert.doesNotMatch(offline.detail,/Контекст проверен/);
assert.equal(documentView({mode:'loading'}).available,false);assert.equal(documentView({...original,mode:'stale'}).stale,true);
assert.equal(documentView({...original,cards:[{id:'drive',level:'unexpected'}]}).level,'wait');
const channels=channelViews(original);assert.equal(channels[0].level,'wait');assert.equal(channels[1].detail,'Получатель: работает · записей: 518');assert.equal(channelViews({...original,mode:'offline'})[1].level,'wait');
console.log('PASS: document warning remains yellow; exact source reason preserved; originals not inferred; offline is unknown; received records are not tasks');


const proofRaw=structuredClone(raw);
proofRaw.artifact_runtime={mode:'shadow',active:true,verified:1,blocked:1,pending_evidence:0,last_result:'blocked',last_stage:'evidence',updated_at:'2026-09-29T20:20:00Z'};
const proofState=toState(proofRaw,Date.parse('2026-09-29T20:21:00Z'));
assert.equal(proofState.artifactRuntime.mode,'shadow');
assert.equal(proofState.artifactRuntime.blocked,1);
assert.equal(proofState.artifactRuntime.lastResult,'blocked');
assert.equal(proofState.artifactRuntime.lastStage,'evidence');
const noProof=structuredClone(raw);delete noProof.artifact_runtime;
assert.equal(toState(noProof).artifactRuntime,null);
const badProof=structuredClone(raw);badProof.artifact_runtime={mode:'unexpected',active:false,last_result:'made-up',last_stage:'magic'};
const normalizedBad=toState(badProof).artifactRuntime;
assert.equal(normalizedBad.mode,'pilot');assert.equal(normalizedBad.active,false);assert.equal(normalizedBad.lastResult,'unknown');assert.equal(normalizedBad.lastStage,null);
console.log('PASS: artifact runtime is optional, fail-closed and never turns unknown data green');

const safeCalendar=normalizeCalendar({schema:'calendar-1',generated_at:'2026-09-29T22:00:00Z',ttl_seconds:21600,events:[{id:'raw-id',title:'Встреча',kind:'meeting',start:'2026-10-01T10:00:00+03:00',end:'2026-10-01T11:00:00+03:00',endConfirmed:true,location:'Керчь',description:'секрет',attendees:['x'],joinUrl:'https://secret.example'}]});
assert.equal(safeCalendar.schema,'calendar-1');assert.equal(safeCalendar.events.length,1);
assert.equal(safeCalendar.events[0].title,'Встреча');assert.equal(safeCalendar.events[0].location,'Керчь');
assert.equal('description' in safeCalendar.events[0],false);assert.equal('attendees' in safeCalendar.events[0],false);assert.equal('joinUrl' in safeCalendar.events[0],false);
assert.equal(normalizeCalendar({schema:'wrong',generated_at:'x',events:[]}),null);
console.log('PASS: calendar projection strips descriptions, attendees and links');


const waitingVisual=structuredClone(raw);
waitingVisual.cards[1]={id:'visual',level:'warn',detail:'2 задания ожидают возобновления генератора'};
const waitingState=toState(waitingVisual,Date.parse('2026-09-30T00:30:00+03:00'));
assert.equal(waitingState.focus[0].level,'wait');
assert.match(waitingState.focus[0].text,/2 задания ожидают возобновления генератора/);
assert.doesNotMatch(waitingState.focus[0].text,/с ошибкой/);

const taskIndex=structuredClone(raw);
taskIndex.cards=[taskIndex.cards[0],{id:'task_index',level:'warn',detail:'Локальный индекс работает · облачная копия ожидает обновления'},taskIndex.cards[2]];
const taskIndexState=toState(taskIndex,Date.parse('2026-09-30T00:30:00+03:00'));
assert.equal(taskIndexState.focus[0].title,'Индекс задач');
assert.match(taskIndexState.focus[0].text,/Локальный индекс задач актуален/);
console.log('PASS: waiting generator and cloud task index are described as warnings, not fabricated failures');

const unavailableReview=structuredClone(raw);
unavailableReview.cards=[
 {id:'system',level:'ok',detail:'Проверка пройдена'},
 {id:'model_eval',level:'unknown',detail:'Нет подтверждённых данных'},
 {id:'publications',level:'ok',detail:'Проверка пройдена'}
];
const unavailableState=toState(unavailableReview,Date.parse('2026-10-06T02:45:00Z'));
assert.equal(unavailableState.metrics.attention,0);
assert.equal(unavailableState.focus.length,0);
assert.equal(unavailableState.verdict.text,'Всё штатно');
assert.equal(unavailableState.cards.find(c=>c.id==='model_eval').level,'none');
console.log('PASS: unavailable optional checks remain neutral and do not become warnings');

const safeTasks=normalizeTaskSummary({schema:'tasks-public-1',generated_at:'2026-09-30T05:00:00Z',items:[{id:'a',title:'Задача',status:'OPEN',project:'rko',source_url:'https://forbidden.example',secret:'x'}],missing_sources:[]});
assert.equal(safeTasks.items.length,1);assert.equal('source_url' in safeTasks.items[0],false);assert.equal('secret' in safeTasks.items[0],false);
const safeInbox=normalizeInboxSummary({schema:'inbox-summary-1',generated_at:'2026-09-30T05:00:00Z',channels:{max:{read_ok:true,total:5,last_24h:2,last_message_at:'2026-09-30T04:00:00Z',attention_count:1,source_states:{internal_secret:5},messages:['secret']}}});
assert.equal(safeInbox.channels.max.total,5);assert.equal(safeInbox.channels.max.attention_count,1);assert.equal('messages' in safeInbox.channels.max,false);assert.equal('source_states' in safeInbox.channels.max,false);
console.log('PASS: safe task/inbox normalizers drop URLs and message content');
