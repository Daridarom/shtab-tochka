#!/usr/bin/env node
// Запуск бота оплат. Конфигурация только из окружения: токены и ключи в репозитории не хранятся.
//   node bot/payments/index.js            — рабочий режим: длинный опрос MAX + расписание
//   node bot/payments/index.js --check    — проверить доступы (бот MAX, таблица, листы), ничего не отправлять
//   node bot/payments/index.js --dry-run [--date 2026-10-05]  — показать напоминания и сводку на дату без отправки
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {PaymentsBot,emptyState} from './bot.js';
import {DEFAULT_TZ,dateKey,localParts,parseDateKey} from './dates.js';
import {Drive,GoogleAuth,SCOPES,Sheets,loadServiceAccount} from './google.js';
import {MaxApi} from './max.js';
import {dailyReminders,monthlySummary,previousMonth,summaryText} from './registry.js';

const env=process.env;
const log={info:(...a)=>console.log(new Date().toISOString(),...a),error:(...a)=>console.error(new Date().toISOString(),...a)};
const args=process.argv.slice(2);const flag=n=>args.includes(n);const opt=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};

export function configFromEnv(e=env){
 let responsibles={};
 if(e.RESPONSIBLE_MAP){try{responsibles=JSON.parse(e.RESPONSIBLE_MAP);}catch(err){throw new Error('RESPONSIBLE_MAP не является JSON');}}
 const daysBefore=(e.REMIND_DAYS_BEFORE||'3,1').split(',').map(s=>Number(s.trim())).filter(n=>Number.isInteger(n)&&n>0);
 return {
  chatId:e.MAX_CHAT_ID?Number(e.MAX_CHAT_ID):null,
  tz:e.BOT_TZ||DEFAULT_TZ,remindAt:e.REMIND_AT||'09:00',daysBefore,responsibles,mentionStyle:e.MENTION_STYLE||'username',
  receiptsFolderId:e.DRIVE_RECEIPTS_FOLDER_ID||null,
  stage2:e.STAGE2_FOLDER_ID?{folderId:e.STAGE2_FOLDER_ID,suffix:e.STAGE2_SUFFIX||'__MAX-',since:e.STAGE2_SINCE||null,everyMinutes:Number(e.STAGE2_EVERY_MINUTES||30)}:null,
  stateFile:e.STATE_FILE||'bot/payments/state/payments.json',
  spreadsheetId:e.SPREADSHEET_ID||null,
 };
}
async function loadState(file){try{return {...emptyState(),...JSON.parse(await readFile(file,'utf8'))};}catch(e){return emptyState();}}
async function saveState(file,state){await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(state),'utf8');}

async function buildGoogle(config){
 const sa=await loadServiceAccount({file:env.GOOGLE_SERVICE_ACCOUNT_FILE,json:env.GOOGLE_SERVICE_ACCOUNT_JSON});
 const scopes=[SCOPES.sheets,SCOPES.driveFile];if(config.stage2)scopes.push(SCOPES.driveRead);
 const auth=new GoogleAuth({...sa,scopes});
 return {auth,sheets:new Sheets(auth,config.spreadsheetId),drive:new Drive(auth)};
}

async function main(){
 const config=configFromEnv();
 if(flag('--dry-run')){
  const {sheets}=await buildGoogle(config);
  const bot=new PaymentsBot({api:null,sheets,drive:null,config,log});
  const today=parseDateKey(opt('--date'))||localParts(Date.now(),config.tz);
  const {obligations,journal}=await bot.registry(true);
  const {items,skipped}=dailyReminders(obligations,journal,today,{daysBefore:config.daysBefore});
  console.log(`Дата: ${dateKey(today)} · обязательств: ${obligations.length} · записей журнала: ${journal.length}`);
  console.log('Пропущено: '+(skipped.map(s=>`${s.id} (${s.reason})`).join(', ')||'ничего'));
  console.log('Напоминания:');for(const it of items)console.log('  • '+bot.reminderMessage(it).text.replace(/\n/g,' · '));
  if(!items.length)console.log('  (нет)');
  console.log('\n'+summaryText(monthlySummary(obligations,journal,previousMonth(today))));
  return;
 }
 const api=new MaxApi(env.MAX_BOT_TOKEN);
 const {sheets,drive}=await buildGoogle(config);
 if(flag('--check')){
  const me=await api.getMe();console.log('MAX: бот @'+(me.username||'?')+' (id '+me.user_id+')');
  if(config.chatId){const chat=await api.getChat(config.chatId);console.log('Чат: '+(chat.title||chat.type)+' · '+chat.participants_count+' участников');}
  else console.log('MAX_CHAT_ID не задан: напоминания отправлять некуда');
  const meta=await sheets.meta();console.log(`Таблица: «${meta.title}» · локаль ${meta.locale} · пояс ${meta.timeZone}`);
  for(const t of ['Обязательства','Журнал оплат','Контроль по месяцам'])console.log('  лист «'+t+'»: '+(meta.sheets[t]!=null?'есть':'НЕТ'));
  console.log('Папка чеков: '+(config.receiptsFolderId||'не задана'));
  return;
 }
 if(!config.chatId)throw new Error('MAX_CHAT_ID не задан');
 const state=await loadState(config.stateFile);
 const bot=new PaymentsBot({api,sheets,drive,config,state,log});
 let saving=Promise.resolve();
 bot.onStateChange=s=>{saving=saving.then(()=>saveState(config.stateFile,s)).catch(e=>log.error('Состояние не сохранено:',e.message));};
 const me=await api.getMe();log.info(`Бот @${me.username||me.user_id} запущен · чат ${config.chatId} · напоминания в ${config.remindAt} (${config.tz})`);
 let stopped=false;const stop=()=>{stopped=true;log.info('Останавливаюсь');};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 // Расписание: раз в минуту. Этап 2: раз в N минут, если настроен.
 let lastScan=0;
 const timer=setInterval(async()=>{
  try{await bot.tick();}catch(e){log.error('tick:',e.message);}
  if(config.stage2&&Date.now()-lastScan>config.stage2.everyMinutes*60000){lastScan=Date.now();try{await bot.scanDocuments();}catch(e){log.error('scan:',e.message);}}
 },60000);
 try{await bot.tick();}catch(e){log.error('tick:',e.message);}
 // Длинный опрос с откатом при ошибках.
 let delay=5000;
 while(!stopped){
  try{
   const r=await api.getUpdates({marker:bot.state.marker,types:['message_created','message_callback','bot_added','bot_started']});
   delay=5000;
   for(const u of r.updates||[])await bot.handleUpdate(u);
   if(r.marker!=null&&r.marker!==bot.state.marker){bot.state.marker=r.marker;bot.save();}
  }catch(e){
   if(e.status===401){log.error('Неверный токен MAX');break;}
   log.error('updates:',e.message,'· повтор через',delay/1000,'с');
   await new Promise(r=>setTimeout(r,delay));delay=Math.min(delay*2,60000);
  }
 }
 clearInterval(timer);await saving;
}
if(import.meta.url===`file://${process.argv[1]}`||process.argv[1]?.endsWith('bot/payments/index.js')){
 main().catch(e=>{log.error(e.message);process.exit(1);});
}
