// Бот «Офис АИ» · оплаты. Связывает реестр (Sheets), чат MAX и папку чеков на Диске.
// Все внешние зависимости передаются в конструктор, поэтому логика проверяется тестами без сети.
import {dateKey,dateToSerial,formatAmount,localParts,monthKey,monthName,parseAmount,parseMonthKey,DEFAULT_TZ} from './dates.js';
import {JOURNAL_RANGE,METHODS,OBLIGATION_RANGE,SHEETS,dailyReminders,extractPaymentFacts,isPaid,journalRow,matchPayment,monthStatus,monthlySummary,parseJournal,parseObligations,previousMonth,statusText,summaryText} from './registry.js';
import {button,escapeMarkdown,imageAttachments,keyboard,senderName} from './max.js';
import {extensionFor} from './google.js';

const DIALOG_TTL_MS=2*60*60*1000;
const REGISTRY_TTL_MS=60*1000;
const HELP='Команды: /статус — оплаты текущего месяца, /сводка — итоги прошлого месяца, /напомнить — разослать напоминания сейчас, /отмена — прервать отметку оплаты.';

export function emptyState(){return {marker:null,lastRunDate:null,lastSummaryMonth:null,reminded:{},dialogs:{},proposals:{},seenFiles:{}};}

export class PaymentsBot{
 constructor({api,sheets,drive,config,state,log=console,now=()=>Date.now()}){
  this.api=api;this.sheets=sheets;this.drive=drive;this.log=log;this.now=now;
  this.config={tz:DEFAULT_TZ,remindAt:'09:00',daysBefore:[3,1],responsibles:{},mentionStyle:'username',receiptsFolderId:null,stage2:null,...config};
  this.state=Object.assign(emptyState(),state||{});
  this.cache=null;this.onStateChange=null;
 }
 today(){return localParts(this.now(),this.config.tz);}
 save(){try{this.onStateChange?.(this.state);}catch(e){this.log.error('Не удалось сохранить состояние:',e.message);}}

 // ---------- реестр ----------
 async registry(force=false){
  if(!force&&this.cache&&this.now()-this.cache.at<REGISTRY_TTL_MS)return this.cache.value;
  const [ob,jr]=await this.sheets.batchGet([OBLIGATION_RANGE,JOURNAL_RANGE]);
  const value={obligations:parseObligations(ob),journal:parseJournal(jr)};
  this.cache={at:this.now(),value};return value;
 }
 async recordPayment({id,ym,amount,method,document,who}){
  const row=journalRow({today:this.today(),id,ym,amount,method,document,who},{dateToSerial});
  const res=await this.sheets.appendRow(SHEETS.journal,row);
  if(res.row)try{await this.sheets.copyRowStyle(SHEETS.journal,res.row);}catch(e){this.log.error('Формат строки журнала не скопирован:',e.message);}
  this.cache=null;return res;
 }

 // ---------- расписание ----------
 // Вызывается раз в минуту. Напоминания — один раз в день после remindAt (догоняет, если бот был выключен в 09:00).
 // Дата рассылки фиксируется только после успеха; при сбое повтор через 10 минут, уже отправленные напоминания не дублируются.
 async tick(){
  const t=this.today();const key=dateKey(t);
  const [hh,mm]=String(this.config.remindAt).split(':').map(Number);
  if(this.state.lastRunDate===key||t.hour*60+t.minute<hh*60+(mm||0))return false;
  if(this.lastAttempt&&this.now()-this.lastAttempt<10*60*1000)return false;
  this.lastAttempt=this.now();
  try{await this.sendReminders();}catch(e){this.log.error('Напоминания не отправлены, повторю позже:',e.message);return false;}
  this.state.lastRunDate=key;this.save();
  if(t.day===1){const prev=previousMonth(t);if(this.state.lastSummaryMonth!==monthKey(prev)){
   try{await this.sendSummary(prev);this.state.lastSummaryMonth=monthKey(prev);this.save();}catch(e){this.log.error('Сводка не отправлена:',e.message);}}}
  return true;
 }
 // ---------- напоминания ----------
 reminderMessage(item){
  const resp=item.responsible?this.mention(item.responsible):null;
  let text=item.text;let format=null;
  if(resp){
   if(resp.format==='markdown'){text=escapeMarkdown(text)+'\nОтветственный: '+resp.text;format='markdown';}
   else text+='\nОтветственный: '+resp.text;
  }
  return {text,format,attachments:[keyboard([[button('Оплачено','paid:'+item.ob.id+':'+item.monthKey)]])]};
 }
 // L «Кто отвечает» — роль или имя; кого упоминать в MAX, задаёт RESPONSIBLE_MAP: {"Бухотдел":{"username":"...","user_id":123,"name":"..."}}.
 mention(responsible){
  const m=this.config.responsibles?.[responsible];
  if(!m)return {text:responsible};
  if(m.username)return {text:'@'+String(m.username).replace(/^@/,'')};
  if(m.user_id&&this.config.mentionStyle==='link')return {text:`[${escapeMarkdown(m.name||responsible)}](max://user/${m.user_id})`,format:'markdown'};
  return {text:m.name||responsible};
 }
 async sendReminders({force=false}={}){
  const t=this.today();const {obligations,journal}=await this.registry(true);
  const {items,skipped}=dailyReminders(obligations,journal,t,{daysBefore:this.config.daysBefore});
  if(skipped.length)this.log.info('Пропущено строк реестра: '+skipped.map(s=>s.id+' ('+s.reason+')').join(', '));
  let sent=0;
  for(const item of items){
   const k=item.ob.id+'|'+dateKey(t);
   if(!force&&this.state.reminded[k])continue;
   await this.api.sendMessage({chatId:this.config.chatId,...this.reminderMessage(item)});
   this.state.reminded[k]=this.now();sent++;
  }
  for(const k of Object.keys(this.state.reminded))if(this.now()-this.state.reminded[k]>40*86400000)delete this.state.reminded[k];
  this.save();this.log.info(`Напоминаний отправлено: ${sent} из ${items.length}`);
  return {sent,items,skipped};
 }
 async sendSummary(ym){
  const {obligations,journal}=await this.registry(true);
  const text=summaryText(monthlySummary(obligations,journal,ym));
  await this.api.sendMessage({chatId:this.config.chatId,text});return text;
 }

 // ---------- обновления MAX ----------
 async handleUpdate(u){
  try{
   if(u.update_type==='message_callback')return await this.handleCallback(u);
   if(u.update_type==='message_created')return await this.handleMessage(u);
   if(u.update_type==='bot_added'||u.update_type==='bot_started'){const chatId=u.chat_id;if(chatId)await this.api.sendMessage({chatId,text:'Я бот оплат «Офис АИ». '+HELP});}
  }catch(e){this.log.error('Ошибка обработки обновления '+u.update_type+':',e.message);
   const chatId=u.message?.recipient?.chat_id||u.chat_id;
   if(chatId)try{await this.api.sendMessage({chatId,text:'Не получилось: '+e.message});}catch(e2){}}
 }
 dialogKey(chatId,userId){return chatId+':'+userId;}
 dialog(chatId,userId){const d=this.state.dialogs[this.dialogKey(chatId,userId)];if(d&&this.now()-d.startedAt>DIALOG_TTL_MS){this.dropDialog(chatId,userId);return null;}return d||null;}
 setDialog(chatId,userId,d){this.state.dialogs[this.dialogKey(chatId,userId)]=d;this.save();}
 dropDialog(chatId,userId){delete this.state.dialogs[this.dialogKey(chatId,userId)];this.save();}

 async handleCallback(u){
  const cb=u.callback;const chatId=u.message?.recipient?.chat_id||this.config.chatId;const userId=cb.user?.user_id;const who=senderName(cb.user);
  const [kind,...rest]=String(cb.payload||'').split(':');
  const say=(text,rows)=>this.api.sendMessage({chatId,text,attachments:rows?[keyboard(rows)]:undefined});
  const ack=n=>this.api.answerCallback(cb.callback_id,{notification:n}).catch(()=>{});
  if(kind==='paid'){
   const [id,mk]=rest;const ym=parseMonthKey(mk)||this.today();
   const {obligations,journal}=await this.registry();const ob=obligations.find(o=>o.id===id);
   if(!ob){await ack('Обязательство не найдено');return;}
   if(isPaid(ob,journal,ym)){await ack('Уже отмечено как оплачено');await say(`${who}, «${ob.article}» за ${monthName(ym)} уже отмечено как оплачено.`);return;}
   this.setDialog(chatId,userId,{step:'amount',id,ym:monthKey(ym),who,startedAt:this.now()});
   await ack('Отмечаем оплату');
   await say(`${who}, «${ob.article}» за ${monthName(ym)}. Сумма оплаты?`,[[button(formatAmount(ob.amount),'amt:'+id+':def'),button('Другая сумма','amt:'+id+':other')],[button('Отмена','cx:'+id)]]);
   return;
  }
  if(kind==='cf'||kind==='cfno'){return this.handleProposal(kind,rest[0],{chatId,who,ack,say});}
  const d=this.dialog(chatId,userId);
  if(!d||(rest[0]&&d.id!==rest[0])){await ack('Сначала нажми «Оплачено» под нужным платежом');return;}
  if(kind==='cx'){this.dropDialog(chatId,userId);await ack('Отменено');await say(`${who}, отметка отменена.`);return;}
  if(kind==='amt'){
   if(rest[1]==='other'){d.step='amount_input';this.setDialog(chatId,userId,d);await ack('Жду сумму');await say(`${who}, напиши сумму числом, например 55000 или 18794,22.`);return;}
   const {obligations}=await this.registry();const ob=obligations.find(o=>o.id===d.id);
   d.amount=ob?.amount;await ack('Сумма принята');return this.askMethod(chatId,userId,d);
  }
  if(kind==='pm'){
   const method=METHODS[rest[1]];if(!method){await ack('Неизвестный способ');return;}
   d.method=method;d.step='photo';this.setDialog(chatId,userId,d);await ack('Способ принят');
   await say(`${who}, пришли фото чека или платёжки одним сообщением.`,[[button('Без чека','np:'+d.id)],[button('Отмена','cx:'+d.id)]]);return;
  }
  if(kind==='np'){await ack('Записываю');return this.finish(chatId,userId,d,{document:'без документа'});}
  await ack('Не понял кнопку');
 }
 async askMethod(chatId,userId,d){
  d.step='method';this.setDialog(chatId,userId,d);
  await this.api.sendMessage({chatId,text:`${d.who}, как платили ${formatAmount(d.amount)}?`,attachments:[keyboard([[button(METHODS.buh,'pm:'+d.id+':buh')],[button(METHODS.card,'pm:'+d.id+':card'),button(METHODS.cash,'pm:'+d.id+':cash')],[button('Отмена','cx:'+d.id)]])]});
 }
 async handleMessage(u){
  const msg=u.message;const chatId=msg.recipient?.chat_id;const userId=msg.sender?.user_id;
  if(!chatId||!userId||msg.sender?.is_bot)return;
  const text=(msg.body?.text||'').trim();const cmd=text.replace(/^@\S+\s*/,'').split(/\s+/)[0]?.toLowerCase();
  if(cmd==='/статус'||cmd==='/status'){const {obligations,journal}=await this.registry(true);const t=this.today();return this.api.sendMessage({chatId,text:statusText(monthStatus(obligations,journal,t),t)});}
  if(cmd==='/сводка'||cmd==='/summary'){return this.sendSummaryTo(chatId);}
  if(cmd==='/напомнить'||cmd==='/remind'){const r=await this.sendReminders({force:true});if(!r.items.length)await this.api.sendMessage({chatId,text:'На сегодня напоминаний нет: всё оплачено или сроки не подошли.'});return;}
  if(cmd==='/помощь'||cmd==='/help'||cmd==='/start'||cmd==='/старт')return this.api.sendMessage({chatId,text:HELP});
  const d=this.dialog(chatId,userId);if(!d)return;
  if(cmd==='/отмена'||/^отмена$/i.test(text)){this.dropDialog(chatId,userId);return this.api.sendMessage({chatId,text:`${d.who}, отметка отменена.`});}
  if(d.step==='amount_input'){
   const amount=parseAmount(text);
   if(amount==null||amount<=0)return this.api.sendMessage({chatId,text:`${d.who}, не разобрал сумму. Напиши число, например 55000.`});
   d.amount=amount;return this.askMethod(chatId,userId,d);
  }
  if(d.step==='photo'){
   const images=imageAttachments(msg);
   if(!images.length)return this.api.sendMessage({chatId,text:`${d.who}, нужно фото чека. Или нажми «Без чека».`});
   return this.finish(chatId,userId,d,{image:images[0]});
  }
 }
 async sendSummaryTo(chatId){const {obligations,journal}=await this.registry(true);const text=summaryText(monthlySummary(obligations,journal,previousMonth(this.today())));return this.api.sendMessage({chatId,text});}

 // Фото → Диск (папка «03 — БАНКИ · ОПЛАТЫ»), строка → журнал. Если Диск недоступен, запись в журнал всё равно делаем и говорим об этом.
 async finish(chatId,userId,d,{image,document}){
  const ym=parseMonthKey(d.ym);const {obligations}=await this.registry();const ob=obligations.find(o=>o.id===d.id)||{id:d.id,article:d.id};
  let doc=document||'фото в MAX',link=null,warn=null;
  if(image){
   try{
    if(!this.drive||!this.config.receiptsFolderId)throw new Error('папка чеков не настроена');
    const {buffer,contentType}=await this.api.download(image.payload.url);
    const name=`${dateKey(this.today())}__${ob.id}__${(ob.article||'').replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,60)}.${extensionFor(contentType)}`;
    const f=await this.drive.upload({name,mimeType:contentType.split(';')[0],buffer,folderId:this.config.receiptsFolderId});
    link=f.webViewLink||null;
   }catch(e){warn='Фото на Диск не сохранилось ('+e.message+'), оно осталось в MAX.';this.log.error('Чек не загружен на Диск:',e.message);}
  }
  const res=await this.recordPayment({id:ob.id,ym,amount:d.amount,method:d.method,document:doc,who:d.who});
  this.dropDialog(chatId,userId);
  const lines=[`✅ Записано в журнал (строка ${res.row??'?'}): ${ob.article}, ${formatAmount(d.amount)}, за ${monthName(ym)}, ${d.method}.`];
  if(link)lines.push('Чек сохранён на Диске: '+link);if(warn)lines.push(warn);
  await this.api.sendMessage({chatId,text:lines.join('\n')});
  return res;
 }

 // ---------- Этап 2: платёжки из чата бухгалтеров ----------
 // Файлы с суффиксом «__MAX-» в папке Drive: достаём ИНН и сумму, сопоставляем с реестром, предлагаем запись кнопкой. Без подтверждения ничего не пишем.
 async scanDocuments(){
  const s2=this.config.stage2;if(!s2?.folderId||!this.drive)return [];
  const files=await this.drive.list({folderId:s2.folderId,nameContains:s2.suffix||'__MAX-',modifiedAfter:s2.since});
  const {obligations,journal}=await this.registry();const ym=this.today();const proposed=[];
  for(const f of files){
   if(this.state.seenFiles[f.id])continue;
   this.state.seenFiles[f.id]=this.now();
   let txt=null;try{txt=await this.drive.text(f);}catch(e){this.log.error('Текст документа не получен:',f.name,e.message);}
   if(!txt)continue;
   const fact=extractPaymentFacts(txt);const matches=matchPayment(fact,{obligations,journal,ym}).filter(m=>m.amountOk||!m.alreadyPaid).slice(0,3);
   for(const m of matches){
    const token=Math.random().toString(36).slice(2,10);
    this.state.proposals[token]={id:m.ob.id,ym:monthKey(ym),amount:fact.amount??m.ob.amount,document:f.name,fileId:f.id,createdAt:this.now()};
    await this.api.sendMessage({chatId:this.config.chatId,text:`Похоже на оплату «${m.ob.article}» (ИНН совпал${m.amountOk?', сумма совпала':', сумма отличается'}): ${formatAmount(fact.amount)} по документу ${f.name}.${m.alreadyPaid?' За этот месяц уже есть оплата.':''}\nЗаписать в журнал за ${monthName(ym)}?`,
     attachments:[keyboard([[button('Подтвердить','cf:'+token),button('Пропустить','cfno:'+token)]])]});
    proposed.push({file:f.name,id:m.ob.id});
   }
  }
  for(const [k,p] of Object.entries(this.state.proposals))if(this.now()-p.createdAt>14*86400000)delete this.state.proposals[k];
  this.save();return proposed;
 }
 async handleProposal(kind,token,{who,ack,say}){
  const p=this.state.proposals[token];
  if(!p){await ack('Предложение устарело');return;}
  delete this.state.proposals[token];this.save();
  if(kind==='cfno'){await ack('Пропущено');return;}
  const {obligations}=await this.registry();const ob=obligations.find(o=>o.id===p.id)||{article:p.id};
  const res=await this.recordPayment({id:p.id,ym:parseMonthKey(p.ym),amount:p.amount,method:METHODS.buh,document:p.document,who});
  await ack('Записано');await say(`✅ Записано в журнал (строка ${res.row??'?'}): ${ob.article}, ${formatAmount(p.amount)}, документ ${p.document}. Подтвердил: ${who}.`);
 }
}
