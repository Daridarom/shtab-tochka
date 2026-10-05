// Реестр платежей: чистая логика над листами «Обязательства» и «Журнал оплат».
// Порядок колонок зафиксирован в HANDOFF и не меняется. Строки без суммы или дня бот пропускает, не падая.
import {daysInMonth,dayOrdinal,daysWord,formatAmount,monthKey,monthName,parseAmount,parseDate,parseDay,parseMonth,prevMonth,sameMonth} from './dates.js';

export const SHEETS={obligations:'Обязательства',journal:'Журнал оплат'};
export const OBLIGATION_RANGE=`'${SHEETS.obligations}'!A2:P`;
export const JOURNAL_RANGE=`'${SHEETS.journal}'!A2:H`;
export const METHODS={buh:'Бухотдел (р/с ООО)',card:'Личная карта',cash:'Наличные'};
export const DEFAULT_DAYS_BEFORE=[3,1];

const cell=(row,i)=>{const v=row?.[i];return v==null?'':typeof v==='string'?v.trim():v;};
const text=(row,i)=>String(cell(row,i));
const yes=v=>/^(да|yes|true|1)$/i.test(String(v||'').trim());

// A ID | B Статья | C Получатель | D ИНН | E Объект | F Сумма по договору | G Сумма сейчас | H Периодичность
// I День оплаты | J Кто платит | K Как платим | L Кто отвечает | M Напоминать | N Договор | O Данные | P Комментарий
export function parseObligations(rows=[]){
 const out=[];
 rows.forEach((row,i)=>{
  const id=text(row,0);if(!id)return;
  out.push({row:i+2,id,article:text(row,1),recipient:text(row,2),inn:text(row,3).replace(/\D/g,''),object:text(row,4),
   contractAmount:parseAmount(cell(row,5)),amount:parseAmount(cell(row,6)),period:text(row,7),day:parseDay(cell(row,8)),
   payer:text(row,9),method:text(row,10),responsible:text(row,11),remind:yes(cell(row,12)),contract:text(row,13),data:text(row,14),comment:text(row,15)});
 });
 return out;
}
// A Дата оплаты | B ID | C Статья | D За месяц | E Сумма | F Как платили | G Документ | H Комментарий
export function parseJournal(rows=[]){
 const out=[];
 rows.forEach((row,i)=>{
  const id=text(row,1);const amount=parseAmount(cell(row,4));
  if(!id&&amount==null)return;
  out.push({row:i+2,date:parseDate(cell(row,0)),id,article:text(row,2),month:parseMonth(cell(row,3)),amount,method:text(row,5),document:text(row,6),comment:text(row,7)});
 });
 return out;
}

export function paidAmount(journal,id,ym){
 let sum=0;for(const j of journal)if(j.id===id&&j.amount!=null&&sameMonth(j.month,ym))sum+=j.amount;
 return Math.round(sum*100)/100;
}
export function isPaid(ob,journal,ym){return ob.amount!=null&&ob.amount>0&&paidAmount(journal,ob.id,ym)>=ob.amount-0.005;}

// Кого напоминаем: M=«Да», заполнены день и сумма сейчас. Остальное — в skipped с причиной, для журнала бота.
export function reminderTargets(obligations){
 const targets=[],skipped=[];
 for(const ob of obligations){
  if(!ob.remind){skipped.push({id:ob.id,reason:'напоминать = нет'});continue;}
  if(!ob.day){skipped.push({id:ob.id,reason:'не указан день оплаты'});continue;}
  if(ob.amount==null||ob.amount<=0){skipped.push({id:ob.id,reason:'не указана сумма сейчас'});continue;}
  targets.push(ob);
 }
 return {targets,skipped};
}
export function dueDay(ob,ym){return Math.min(ob.day,daysInMonth(ym.year,ym.month));}

// Стадия напоминания на сегодня: за N дней (из списка), в день оплаты, каждый день после срока. Иначе null.
export function reminderStage(ob,today,{daysBefore=DEFAULT_DAYS_BEFORE}={}){
 const due=dueDay(ob,today);const left=due-today.day;
 if(left===0)return {kind:'today',days:0,due};
 if(left<0)return {kind:'overdue',days:-left,due};
 if(daysBefore.includes(left))return {kind:'before',days:left,due};
 return null;
}
export function stagePrefix(stage){
 if(stage.kind==='today')return 'Сегодня';
 if(stage.kind==='overdue')return 'Просрочено на '+daysWord(stage.days);
 if(stage.days===1)return 'Завтра';
 return 'Через '+daysWord(stage.days);
}
// «Завтра: Аренда салона Top Thai Spa, 55 000 ₽, до 5-го. Платит: Бухотдел (р/с ООО)»
export function reminderText(ob,stage){
 const who=ob.method||ob.payer||'не указано';
 return `${stagePrefix(stage)}: ${ob.article||ob.id}, ${formatAmount(ob.amount)}, до ${dayOrdinal(stage.due)}. Платит: ${who}`;
}
export function dailyReminders(obligations,journal,today,opts={}){
 const {targets,skipped}=reminderTargets(obligations);const items=[];
 for(const ob of targets){
  if(isPaid(ob,journal,today))continue;
  const stage=reminderStage(ob,today,opts);if(!stage)continue;
  items.push({ob,stage,text:reminderText(ob,stage),responsible:ob.responsible,monthKey:monthKey(today)});
 }
 items.sort((a,b)=>a.stage.due-b.stage.due||a.ob.id.localeCompare(b.ob.id));
 return {items,skipped};
}
// Состояние текущего месяца для команды «/статус».
export function monthStatus(obligations,journal,today){
 const {targets}=reminderTargets(obligations);
 return targets.map(ob=>{const paid=paidAmount(journal,ob.id,today);const due=dueDay(ob,today);
  const status=paid>=ob.amount-0.005?'Оплачено':today.day>due?'Просрочено':'Ждёт оплаты';
  return {ob,paid,due,status};});
}
export function statusText(rows,today){
 if(!rows.length)return 'В реестре нет обязательств с напоминанием, днём и суммой.';
 const mark={'Оплачено':'✅','Ждёт оплаты':'⏳','Просрочено':'❗'};
 return [`Статус за ${monthName(today)}:`,...rows.map(r=>`${mark[r.status]} ${r.ob.article||r.ob.id} — ${formatAmount(r.ob.amount)}, до ${dayOrdinal(r.due)}`+(r.paid&&r.status!=='Оплачено'?` (внесено ${formatAmount(r.paid)})`:''))].join('\n');
}

// Сводка за месяц: что оплачено, что нет, сколько ушло с личных карт.
const isPersonalCard=m=>/личн/i.test(m||'');
export function monthlySummary(obligations,journal,ym){
 const {targets}=reminderTargets(obligations);const paid=[],unpaid=[];
 for(const ob of targets){const sum=paidAmount(journal,ob.id,ym);(sum>=ob.amount-0.005?paid:unpaid).push({ob,paid:sum});}
 const personal=journal.filter(j=>sameMonth(j.month,ym)&&isPersonalCard(j.method)&&j.amount!=null);
 const personalTotal=Math.round(personal.reduce((s,j)=>s+j.amount,0)*100)/100;
 const total=Math.round(journal.filter(j=>sameMonth(j.month,ym)&&j.amount!=null).reduce((s,j)=>s+j.amount,0)*100)/100;
 return {ym,paid,unpaid,personal,personalTotal,total};
}
export function summaryText(s){
 const lines=[`Сводка за ${monthName(s.ym)}`,`Оплачено: ${s.paid.length}, не оплачено: ${s.unpaid.length}. Всего в журнале: ${formatAmount(s.total)}.`];
 if(s.paid.length)lines.push('','✅ Оплачено:',...s.paid.map(p=>`• ${p.ob.article||p.ob.id} — ${formatAmount(p.paid)}`));
 if(s.unpaid.length)lines.push('','❗ Не оплачено:',...s.unpaid.map(p=>`• ${p.ob.article||p.ob.id} — ${formatAmount(p.ob.amount)}`+(p.paid?` (внесено ${formatAmount(p.paid)})`:'')));
 lines.push('',`С личных карт: ${formatAmount(s.personalTotal)}`+(s.personal.length?` (${s.personal.length} ${s.personal.length===1?'оплата':s.personal.length<5?'оплаты':'оплат'})`:''));
 return lines.join('\n');
}
export function previousMonth(today){return prevMonth(today);}

// Строка журнала для записи. Даты — серийные числа Sheets, формат и формула колонки C копируются с первой строки журнала.
export function journalRow({today,id,ym,amount,method,document,who},{dateToSerial}){
 return [dateToSerial(today),id,'',dateToSerial({year:ym.year,month:ym.month,day:1}),amount,method,document||'',who?'отметил: '+who:''];
}

// ---------- Этап 2: платёжки из чата бухгалтеров ----------
// Из текста документа достаём ИНН получателя и сумму. Ничего не записываем — только предлагаем.
export function extractPaymentFacts(txt=''){
 const t=String(txt);
 const inns=[...t.matchAll(/ИНН[^\d]{0,20}(\d{12}|\d{10})(?!\d)/gi)].map(m=>m[1]);
 const amountMatch=/(?:сумма|итого|к оплате)[^\d]{0,30}(\d[\d  ]*(?:[.,]\d{1,2})?)/i.exec(t);
 const dateMatch=/(\d{2}\.\d{2}\.\d{4})/.exec(t);
 return {inns:[...new Set(inns)],amount:amountMatch?parseAmount(amountMatch[1]):null,date:dateMatch?parseDate(dateMatch[1]):null};
}
// Кандидаты: совпал ИНН, сумма близка к «сумме сейчас» (или договорной), за месяц ещё не закрыто.
export function matchPayment(fact,{obligations,journal,ym,tolerance=0.01}){
 const out=[];
 for(const ob of obligations){
  if(!ob.inn||!fact.inns?.includes(ob.inn))continue;
  const candidates=[ob.amount,ob.contractAmount].filter(a=>a!=null&&a>0);
  const amountOk=fact.amount!=null&&candidates.some(a=>Math.abs(a-fact.amount)<=Math.max(tolerance*a,0.01));
  const alreadyPaid=isPaid(ob,journal,ym);
  out.push({ob,amountOk,alreadyPaid,score:(amountOk?2:0)+(alreadyPaid?0:1)});
 }
 return out.sort((a,b)=>b.score-a.score||a.ob.id.localeCompare(b.ob.id));
}
