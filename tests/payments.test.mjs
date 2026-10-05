// Бот оплат: разбор реестра, стадии напоминаний, тексты, запись в журнал, диалог «Оплачено», сводка, этап 2.
// Данные вымышленные, но повторяют структуру таблицы «Реестр платежей»: суммы как числа и как «55 000,00 ₽», даты серийные.
import assert from 'node:assert/strict';
import {dateToSerial,formatAmount,localParts,parseAmount,parseDay,parseMonth,serialToDate,dateKey} from '../bot/payments/dates.js';
import * as R from '../bot/payments/registry.js';
import {PaymentsBot,emptyState} from '../bot/payments/bot.js';
import {configFromEnv} from '../bot/payments/index.js';

// ---------- даты и числа ----------
assert.deepEqual(serialToDate(46296),{year:2026,month:10,day:1});
assert.equal(dateToSerial({year:2026,month:9,day:1}),46266);
assert.deepEqual(parseMonth(46266),{year:2026,month:9});
assert.deepEqual(parseMonth('09.2026'),{year:2026,month:9});
assert.deepEqual(parseMonth('01.10.2026'),{year:2026,month:10});
assert.deepEqual(parseMonth('2026-10-01'),{year:2026,month:10});
assert.equal(parseMonth(''),null);assert.equal(parseMonth('13.2026'),null);
assert.equal(parseAmount('55 000,00 ₽'),55000);assert.equal(parseAmount('18 794,22 ₽'),18794.22);assert.equal(parseAmount(819.73),819.73);assert.equal(parseAmount(''),null);assert.equal(parseAmount('Проверить'),null);
assert.equal(parseDay(5),5);assert.equal(parseDay('12'),12);assert.equal(parseDay('5-го'),5);assert.equal(parseDay(''),null);assert.equal(parseDay(0),null);assert.equal(parseDay(32),null);
assert.equal(formatAmount(55000),'55 000 ₽');assert.equal(formatAmount(18794.22),'18 794,22 ₽');assert.equal(formatAmount(819.73),'819,73 ₽');
// 09:00 Симферополя = 06:00 UTC; граница суток не ломается.
assert.deepEqual(localParts(Date.parse('2026-10-05T06:00:00Z')),{year:2026,month:10,day:5,hour:9,minute:0});
assert.deepEqual(localParts(Date.parse('2026-10-05T22:30:00Z')).day,6);
console.log('PASS: даты Sheets, русские суммы и дни оплаты разбираются, часовой пояс Europe/Simferopol');

// ---------- реестр ----------
const OB=[
 ['O-01','Аренда салона','ИП Арендодатель','910200000001','Козлова, 1',60000,55000,'Ежемесячно',5,'ООО','Бухотдел (р/с ООО)','Бухотдел','Да','договор','Проверить',''],
 ['O-02','Коммунальные салона','ИП Арендодатель','910200000001','',  '',18794.22,'Ежемесячно по счёту','','ООО','Бухотдел (р/с ООО)','Бухотдел','Да'],
 ['O-03','Субаренда офиса','ИП Офис','911100000002','','21 000,00 ₽','11 000,00 ₽','Ежемесячно','12','ООО','Бухотдел (р/с ООО)','Бухотдел','Да'],
 ['O-07','Аренда квартиры','Физлицо','','ул. Примерная',35000,35000,'Ежемесячно',11,'ООО (по договору)','','','Да'],
 ['O-09','Вывоз мусора','АО Эко','9102000003','',819.73,819.73,'Ежемесячно',10,'ООО','Бухотдел (р/с ООО)','Бухотдел','Да'],
 ['O-12','Интернет','Провайдер','','',null,650,'Ежемесячно',1,'','','','Да'],
 ['O-14','VPN','','','','','','Ежемесячно','','','','','Да'],
 ['O-18','Налоги','ФНС','','','','','Ежемесячно',28,'ООО','Бухотдел (р/с ООО)','Бухотдел','Да'],
 ['O-19','Маркетинг','Самозанятая','','',30000,'','Дважды в месяц','','ООО','Бухотдел (р/с ООО)','Бухотдел','Нет'],
 ['O-31','Платёж 31-го','Кто-то','','',1000,1000,'Ежемесячно',31,'ООО','Личная карта','Алексей','Да'],
 [],['','','пустая строка без ID'],
];
const JR=[
 [46266,'O-01','Аренда салона',46266,30000,'Бухотдел (р/с ООО)','Выписка','сентябрь со скидкой'],
 [46296,'O-01','Аренда салона',46296,55000,'Бухотдел (р/с ООО)','П/п № 168','октябрь'],
 [46296,'O-02','Коммунальные салона',46235,18794.22,'Бухотдел (р/с ООО)','П/п № 169','за август'],
 ['','O-03','Субаренда офиса','09.2026','11 000,00 ₽','Бухотдел (р/с ООО)','П/п № 136','дата не указана'],
 [46270,'O-09','Вывоз мусора',46266,819.73,'Личная карта','фото в MAX','отметил: Полина'],
 [46275,'Разово','',46266,2500,'Личная карта','чек','разовая покупка'],
 [],
];
const obligations=R.parseObligations(OB);const journal=R.parseJournal(JR);
assert.equal(obligations.length,10,'пустые строки и строки без ID пропущены');
assert.equal(obligations[2].amount,11000);assert.equal(obligations[2].contractAmount,21000);assert.equal(obligations[2].day,12);
assert.equal(obligations[1].day,null);assert.equal(obligations[6].amount,null);
assert.equal(journal.length,6);assert.deepEqual(journal[3].month,{year:2026,month:9});assert.equal(journal[3].amount,11000);assert.equal(journal[3].date,null);
const {targets,skipped}=R.reminderTargets(obligations);
assert.deepEqual(targets.map(o=>o.id),['O-01','O-03','O-07','O-09','O-12','O-31']);
assert.deepEqual(skipped.map(s=>s.id+':'+s.reason),['O-02:не указан день оплаты','O-14:не указан день оплаты','O-18:не указана сумма сейчас','O-19:напоминать = нет']);
const oct={year:2026,month:10},sep={year:2026,month:9};
assert.equal(R.paidAmount(journal,'O-01',oct),55000);assert.equal(R.isPaid(obligations[0],journal,oct),true);assert.equal(R.isPaid(obligations[0],journal,sep),false,'30 000 < 55 000');
assert.equal(R.isPaid(obligations[2],journal,sep),true,'текстовые сумма и месяц в журнале тоже считаются');
console.log('PASS: реестр разбирается, строки без суммы или дня пропускаются с причиной, «оплачено» считается по месяцу и сумме');

// ---------- стадии напоминаний ----------
const ob1=obligations[0];
const st=(d)=>R.reminderStage(ob1,{year:2026,month:10,day:d});
assert.equal(st(1),null);assert.deepEqual(st(2),{kind:'before',days:3,due:5});assert.equal(st(3),null);assert.deepEqual(st(4),{kind:'before',days:1,due:5});
assert.deepEqual(st(5),{kind:'today',days:0,due:5});assert.deepEqual(st(7),{kind:'overdue',days:2,due:5});
assert.equal(R.reminderStage(ob1,{year:2026,month:10,day:3},{daysBefore:[3,2,1]}).days,2,'список дней настраиваемый');
assert.equal(R.reminderText(ob1,st(4)),'Завтра: Аренда салона, 55 000 ₽, до 5-го. Платит: Бухотдел (р/с ООО)');
assert.equal(R.reminderText(ob1,st(2)),'Через 3 дня: Аренда салона, 55 000 ₽, до 5-го. Платит: Бухотдел (р/с ООО)');
assert.equal(R.reminderText(ob1,st(5)),'Сегодня: Аренда салона, 55 000 ₽, до 5-го. Платит: Бухотдел (р/с ООО)');
assert.equal(R.reminderText(ob1,st(6)),'Просрочено на 1 день: Аренда салона, 55 000 ₽, до 5-го. Платит: Бухотдел (р/с ООО)');
assert.equal(R.reminderText(ob1,st(10)),'Просрочено на 5 дней: Аренда салона, 55 000 ₽, до 5-го. Платит: Бухотдел (р/с ООО)');
assert.equal(R.reminderText(obligations[3],R.reminderStage(obligations[3],{year:2026,month:10,day:11})),'Сегодня: Аренда квартиры, 35 000 ₽, до 11-го. Платит: ООО (по договору)','без «Как платим» берём «Кто платит»');
// 31-е в ноябре = 30-е; февраль 2027 = 28-е.
assert.equal(R.reminderStage(obligations[9],{year:2026,month:11,day:30}).kind,'today');
assert.equal(R.reminderStage(obligations[9],{year:2027,month:2,day:25}).days,3);
// День 5 октября: O-01 оплачен → нет; O-09 (10-е) ещё не оплачен за октябрь → через 5 дней нет; O-12 (1-е) просрочен на 4 дня; O-03 (12-е) нет.
const d5=R.dailyReminders(obligations,journal,{year:2026,month:10,day:5});
assert.deepEqual(d5.items.map(i=>i.ob.id+'|'+i.stage.kind),['O-12|overdue']);
const d7=R.dailyReminders(obligations,journal,{year:2026,month:10,day:7});
assert.deepEqual(d7.items.map(i=>i.ob.id),['O-12','O-09'],'сортировка по сроку: просроченное раньше');
assert.equal(d7.items[1].text,'Через 3 дня: Вывоз мусора, 819,73 ₽, до 10-го. Платит: Бухотдел (р/с ООО)');
console.log('PASS: напоминание за 3 дня, накануне, в день оплаты и каждый день после; оплаченные молчат; конец месяца учтён');

// ---------- статус и сводка ----------
const status=R.monthStatus(obligations,journal,{year:2026,month:10,day:5});
assert.deepEqual(status.map(s=>s.ob.id+':'+s.status),['O-01:Оплачено','O-03:Ждёт оплаты','O-07:Ждёт оплаты','O-09:Ждёт оплаты','O-12:Просрочено','O-31:Ждёт оплаты']);
const sum=R.monthlySummary(obligations,journal,sep);
assert.deepEqual(sum.paid.map(p=>p.ob.id),['O-03','O-09']);assert.deepEqual(sum.unpaid.map(p=>p.ob.id),['O-01','O-07','O-12','O-31']);
assert.equal(sum.personalTotal,3319.73,'личные карты: 819,73 + 2 500 (разовая тоже считается)');
const sumText=R.summaryText(sum);
assert.match(sumText,/Сводка за сентябрь 2026/);assert.match(sumText,/Оплачено: 2, не оплачено: 4/);assert.match(sumText,/• Аренда салона — 55 000 ₽ \(внесено 30 000 ₽\)/);assert.match(sumText,/С личных карт: 3 319,73 ₽ \(2 оплаты\)/);
console.log('PASS: статус месяца и сводка за прошлый месяц с личными картами');

// ---------- строка журнала ----------
const row=R.journalRow({today:{year:2026,month:10,day:5},id:'O-09',ym:oct,amount:819.73,method:'Личная карта',document:'фото в MAX',who:'Полина'},{dateToSerial});
assert.deepEqual(row,[46300,'O-09','',46296,819.73,'Личная карта','фото в MAX','отметил: Полина']);
assert.deepEqual(serialToDate(row[3]),{year:2026,month:10,day:1},'колонка D — 1-е число месяца, как ждёт формула контроля');
console.log('PASS: строка журнала: A сегодня, B ID, C пусто под формулу, D 1-е число месяца, E–H значения');

// ---------- этап 2 ----------
const fact=R.extractPaymentFacts('Платёжное поручение № 168 от 01.10.2026\nПолучатель: ИП Арендодатель ИНН 910200000001 КПП —\nСумма: 55 000,00 руб.');
assert.deepEqual(fact.inns,['910200000001']);assert.equal(fact.amount,55000);assert.deepEqual(fact.date,{year:2026,month:10,day:1});
const matches=R.matchPayment(fact,{obligations,journal,ym:oct});
assert.deepEqual(matches.map(m=>m.ob.id+':'+m.amountOk+':'+m.alreadyPaid),['O-01:true:true','O-02:false:false']);
assert.equal(R.matchPayment({inns:['000'],amount:1},{obligations,journal,ym:oct}).length,0);
console.log('PASS: этап 2: ИНН и сумма из текста платёжки сопоставляются с реестром, без записи');

// ---------- бот: напоминания, диалог «Оплачено», запись ----------
function fakeWorld({obRows=OB,jrRows=JR}={}){
 const sent=[],answers=[],appended=[],styled=[],uploads=[];
 const api={sendMessage:async m=>{sent.push(m);return {body:{mid:'m'+sent.length}};},answerCallback:async(id,o)=>{answers.push({id,...o});return {success:true};},download:async url=>({buffer:Buffer.from('jpg'),contentType:'image/jpeg'})};
 const sheets={batchGet:async()=>[obRows,jrRows],appendRow:async(t,v)=>{appended.push({t,v});jrRows=[...jrRows,v];return {row:jrRows.length+1,updatedRange:`'${t}'!A${jrRows.length+1}:H${jrRows.length+1}`};},copyRowStyle:async(t,r)=>{styled.push({t,r});}};
 const drive={upload:async f=>{uploads.push(f);return {id:'f1',webViewLink:'https://drive.google.com/file/d/f1/view'};}};
 return {api,sheets,drive,sent,answers,appended,styled,uploads};
}
let nowMs=Date.parse('2026-10-05T06:00:00Z');// 09:00 Симферополь
const w=fakeWorld();
const bot=new PaymentsBot({api:w.api,sheets:w.sheets,drive:w.drive,log:{info(){},error(){}},now:()=>nowMs,state:emptyState(),
 config:{chatId:-100,receiptsFolderId:'folder',responsibles:{'Бухотдел':{username:'polina'}}}});
assert.equal(await bot.tick(),true);
assert.equal(w.sent.length,1);
assert.equal(w.sent[0].chatId,-100);
assert.equal(w.sent[0].text,'Просрочено на 4 дня: Интернет, 650 ₽, до 1-го. Платит: не указано','пустая колонка L — без строки «Ответственный»');
assert.deepEqual(w.sent[0].attachments,[{type:'inline_keyboard',payload:{buttons:[[{type:'callback',text:'Оплачено',payload:'paid:O-12:2026-10'}]]}}]);
assert.equal(await bot.tick(),false,'второй вызов в тот же день ничего не шлёт');
assert.equal(w.sent.length,1);
// Накануне 10-го: напоминание про мусор с упоминанием ответственного по карте RESPONSIBLE_MAP.
nowMs=Date.parse('2026-10-09T06:01:00Z');
assert.equal(await bot.tick(),true);
const musor=w.sent.find(m=>/Вывоз мусора/.test(m.text));
assert.equal(musor.text,'Завтра: Вывоз мусора, 819,73 ₽, до 10-го. Платит: Бухотдел (р/с ООО)\nОтветственный: @polina');
assert.equal(musor.format,null);
// Упоминание ссылкой при mentionStyle=link и user_id: текст экранирован, формат markdown.
const linkBot=new PaymentsBot({api:w.api,sheets:w.sheets,drive:null,log:{info(){},error(){}},now:()=>nowMs,config:{chatId:-1,mentionStyle:'link',responsibles:{'Бухотдел':{user_id:77,name:'Полина'}}}});
const lm=linkBot.reminderMessage({ob:obligations[4],monthKey:'2026-10',responsible:'Бухотдел',text:'Завтра: Вывоз мусора, 819,73 ₽, до 10-го. Платит: Бухотдел (р/с ООО)'});
assert.equal(lm.format,'markdown');assert.match(lm.text,/\[Полина\]\(max:\/\/user\/77\)$/);assert.match(lm.text,/Бухотдел \\\(р\/с ООО\\\)/);
console.log('PASS: рассылка раз в день, кнопка «Оплачено» с ID и месяцем, упоминание ответственного по карте');

// Диалог: «Оплачено» → сумма по умолчанию → Личная карта → фото → строка в журнале + файл на Диске.
const user={user_id:501,first_name:'Полина',last_name:'С.',is_bot:false};
const cbMsg={recipient:{chat_id:-100,chat_type:'chat'},body:{mid:'m1'}};
const press=(payload,u=user)=>bot.handleUpdate({update_type:'message_callback',timestamp:nowMs,callback:{callback_id:'cb-'+payload,payload,user:u},message:cbMsg});
const before=w.sent.length;
await press('paid:O-09:2026-10');
assert.equal(w.answers.at(-1).notification,'Отмечаем оплату');
assert.equal(w.sent.at(-1).text,'Полина С., «Вывоз мусора» за октябрь 2026. Сумма оплаты?');
assert.deepEqual(w.sent.at(-1).attachments[0].payload.buttons[0].map(b=>b.text),['819,73 ₽','Другая сумма']);
// Чужой пользователь жмёт кнопку этапа — его просят начать с «Оплачено».
await press('amt:O-09:def',{user_id:999,first_name:'Гость',is_bot:false});
assert.equal(w.answers.at(-1).notification,'Сначала нажми «Оплачено» под нужным платежом');
await press('amt:O-09:def');
assert.match(w.sent.at(-1).text,/как платили 819,73 ₽\?/);
assert.deepEqual(w.sent.at(-1).attachments[0].payload.buttons.flat().map(b=>b.payload),['pm:O-09:buh','pm:O-09:card','pm:O-09:cash','cx:O-09']);
await press('pm:O-09:card');
assert.match(w.sent.at(-1).text,/пришли фото чека/);
// Текст вместо фото — просим фото ещё раз, ничего не пишем.
await bot.handleUpdate({update_type:'message_created',timestamp:nowMs,message:{sender:user,recipient:{chat_id:-100,chat_type:'chat'},body:{mid:'m2',text:'вот',attachments:null}}});
assert.match(w.sent.at(-1).text,/нужно фото чека/);assert.equal(w.appended.length,0);
await bot.handleUpdate({update_type:'message_created',timestamp:nowMs,message:{sender:user,recipient:{chat_id:-100,chat_type:'chat'},body:{mid:'m3',text:null,attachments:[{type:'image',payload:{photo_id:1,token:'t',url:'https://files.example/receipt.jpg'}}]}}});
assert.equal(w.appended.length,1);
assert.equal(w.appended[0].t,'Журнал оплат');
assert.deepEqual(w.appended[0].v,[dateToSerial({year:2026,month:10,day:9}),'O-09','',46296,819.73,'Личная карта','фото в MAX','отметил: Полина С.']);
assert.deepEqual(w.styled,[{t:'Журнал оплат',r:9}],'формула C и формат A:H скопированы на новую строку');
assert.equal(w.uploads.length,1);assert.equal(w.uploads[0].folderId,'folder');assert.equal(w.uploads[0].name,'2026-10-09__O-09__Вывоз мусора.jpg');assert.equal(w.uploads[0].mimeType,'image/jpeg');
assert.match(w.sent.at(-1).text,/✅ Записано в журнал \(строка 9\): Вывоз мусора, 819,73 ₽, за октябрь 2026, Личная карта\./);
assert.match(w.sent.at(-1).text,/Чек сохранён на Диске: https:\/\/drive\.google\.com/);
assert.equal(bot.dialog(-100,501),null,'диалог закрыт');
// Теперь O-09 оплачен: повторное «Оплачено» не открывает диалог.
await press('paid:O-09:2026-10');
assert.equal(w.answers.at(-1).notification,'Уже отмечено как оплачено');assert.equal(w.appended.length,1);
console.log('PASS: диалог «Оплачено» пишет корректную строку журнала и кладёт фото в папку Диска; чужие нажатия и текст вместо фото не пишут ничего');

// Другая сумма текстом, «Без чека», отмена.
await press('paid:O-03:2026-10');await press('amt:O-03:other');
assert.match(w.sent.at(-1).text,/напиши сумму числом/);
const msg=(text)=>bot.handleUpdate({update_type:'message_created',timestamp:nowMs,message:{sender:user,recipient:{chat_id:-100,chat_type:'chat'},body:{mid:'x',text}}});
await msg('много');assert.match(w.sent.at(-1).text,/не разобрал сумму/);
await msg('10 500,50');assert.match(w.sent.at(-1).text,/как платили 10 500,50 ₽/);
await press('pm:O-03:buh');await press('np:O-03');
assert.equal(w.appended.length,2);assert.deepEqual(w.appended[1].v.slice(1,8),['O-03','',46296,10500.5,'Бухотдел (р/с ООО)','без документа','отметил: Полина С.']);
await press('paid:O-07:2026-10');await msg('/отмена');
assert.match(w.sent.at(-1).text,/отметка отменена/);assert.equal(bot.dialog(-100,501),null);
// Команды.
await msg('/статус');assert.match(w.sent.at(-1).text,/Статус за октябрь 2026/);assert.match(w.sent.at(-1).text,/✅ Вывоз мусора/);assert.match(w.sent.at(-1).text,/❗ Интернет/);
await msg('/сводка');assert.match(w.sent.at(-1).text,/Сводка за сентябрь 2026/);
// Диск недоступен: запись в журнал всё равно есть, в ответе предупреждение.
const w2=fakeWorld();
const bot2=new PaymentsBot({api:w2.api,sheets:w2.sheets,drive:{upload:async()=>{throw new Error('403');}},log:{info(){},error(){}},now:()=>nowMs,config:{chatId:-100,receiptsFolderId:'folder'}});
const press2=p=>bot2.handleUpdate({update_type:'message_callback',timestamp:nowMs,callback:{callback_id:'c',payload:p,user},message:cbMsg});
await press2('paid:O-07:2026-10');await press2('amt:O-07:def');await press2('pm:O-07:cash');
await bot2.handleUpdate({update_type:'message_created',timestamp:nowMs,message:{sender:user,recipient:{chat_id:-100,chat_type:'chat'},body:{mid:'m',attachments:[{type:'image',payload:{url:'https://files.example/a.jpg',token:'t',photo_id:2}}]}}});
assert.equal(w2.appended.length,1);assert.equal(w2.appended[0].v[6],'фото в MAX');assert.match(w2.sent.at(-1).text,/Фото на Диск не сохранилось/);
console.log('PASS: другая сумма, без чека, отмена, команды, деградация без Диска');

// Сводка 1-го числа: один раз за месяц.
const w3=fakeWorld();let t3=Date.parse('2026-11-01T07:00:00Z');
const bot3=new PaymentsBot({api:w3.api,sheets:w3.sheets,drive:null,log:{info(){},error(){}},now:()=>t3,state:emptyState(),config:{chatId:-5}});
await bot3.tick();
const summary=w3.sent.filter(m=>/Сводка за октябрь 2026/.test(m.text));
assert.equal(summary.length,1);assert.equal(bot3.state.lastSummaryMonth,'2026-10');
assert.match(summary[0].text,/✅ Оплачено:\n• Аренда салона — 55 000 ₽/);
t3=Date.parse('2026-11-01T09:00:00Z');await bot3.tick();
assert.equal(w3.sent.filter(m=>/Сводка/.test(m.text)).length,1);
// До 09:00 ничего не шлём; состояние с прошлого дня догоняет после запуска.
const w4=fakeWorld();let t4=Date.parse('2026-10-07T05:59:00Z');
const bot4=new PaymentsBot({api:w4.api,sheets:w4.sheets,drive:null,log:{info(){},error(){}},now:()=>t4,state:{...emptyState(),lastRunDate:'2026-10-06'},config:{chatId:-5}});
assert.equal(await bot4.tick(),false);t4=Date.parse('2026-10-07T08:30:00Z');assert.equal(await bot4.tick(),true);assert.equal(w4.sent.length,2);
console.log('PASS: сводка 1-го числа один раз, расписание догоняет пропущенные 09:00');

// Этап 2: предложение по платёжке и подтверждение.
const w5=fakeWorld();const files=[{id:'d1',name:'pp168__MAX-2026-10-01.txt',mimeType:'text/plain'},{id:'d2',name:'scan__MAX-2.pdf',mimeType:'application/pdf'}];
const drive5={list:async()=>files,text:async f=>f.id==='d1'?'Платёжное поручение ИНН 910200000001 Сумма 18 794,22':null};
const bot5=new PaymentsBot({api:w5.api,sheets:w5.sheets,drive:drive5,log:{info(){},error(){}},now:()=>Date.parse('2026-10-05T07:00:00Z'),state:emptyState(),config:{chatId:-9,stage2:{folderId:'fin'}}});
const proposed=await bot5.scanDocuments();
assert.deepEqual(proposed,[{file:'pp168__MAX-2026-10-01.txt',id:'O-02'}],'ИНН общий у O-01 и O-02, но O-01 оплачен и сумма не его');
assert.equal(w5.appended.length,0,'без подтверждения ничего не пишем');
const token=w5.sent.at(-1).attachments[0].payload.buttons[0][0].payload.split(':')[1];
assert.deepEqual(await bot5.scanDocuments(),[],'повторный скан те же файлы не предлагает');
await bot5.handleUpdate({update_type:'message_callback',timestamp:1,callback:{callback_id:'k',payload:'cf:'+token,user},message:{recipient:{chat_id:-9}}});
assert.equal(w5.appended.length,1);assert.deepEqual(w5.appended[0].v.slice(1,7),['O-02','',46296,18794.22,'Бухотдел (р/с ООО)','pp168__MAX-2026-10-01.txt']);
await bot5.handleUpdate({update_type:'message_callback',timestamp:1,callback:{callback_id:'k',payload:'cf:'+token,user},message:{recipient:{chat_id:-9}}});
assert.equal(w5.answers.at(-1).notification,'Предложение устарело');assert.equal(w5.appended.length,1);
console.log('PASS: этап 2 предлагает запись кнопкой и пишет только после «Подтвердить»');

// Конфигурация из окружения.
const cfg=configFromEnv({MAX_CHAT_ID:'-123',REMIND_DAYS_BEFORE:'3, 1',RESPONSIBLE_MAP:'{"Бухотдел":{"username":"polina"}}',SPREADSHEET_ID:'sheet'});
assert.equal(cfg.chatId,-123);assert.deepEqual(cfg.daysBefore,[3,1]);assert.equal(cfg.responsibles['Бухотдел'].username,'polina');assert.equal(cfg.remindAt,'09:00');assert.equal(cfg.tz,'Europe/Simferopol');
assert.throws(()=>configFromEnv({RESPONSIBLE_MAP:'{oops'}),/JSON/);
console.log('PASS: конфигурация из окружения без секретов в коде');

// Сбой таблицы в 09:00: дата не фиксируется, повтор через 10 минут, после успеха — один раз.
{
 let fail=true;let t=Date.parse('2026-10-07T06:00:00Z');const sent=[];
 const sheets={batchGet:async()=>{if(fail)throw new Error('503');return [OB,JR];}};
 const b=new PaymentsBot({api:{sendMessage:async m=>{sent.push(m);}},sheets,drive:null,log:{info(){},error(){}},now:()=>t,state:emptyState(),config:{chatId:-1}});
 assert.equal(await b.tick(),false);assert.equal(b.state.lastRunDate,null);
 fail=false;t+=60000;assert.equal(await b.tick(),false,'раньше 10 минут не повторяем');
 t+=10*60000;assert.equal(await b.tick(),true);assert.equal(b.state.lastRunDate,'2026-10-07');assert.equal(sent.length,2);
 t+=60000;assert.equal(await b.tick(),false);assert.equal(sent.length,2);
 console.log('PASS: сбой источника в 09:00 не теряет напоминания на день');
}
