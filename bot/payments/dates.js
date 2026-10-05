// Даты для бота оплат: локальный календарь Europe/Simferopol, серийные даты Google Sheets, русские форматы.
// Здесь нет сетевых вызовов и состояния — всё проверяется тестами.

export const DEFAULT_TZ='Europe/Simferopol';
const SHEETS_EPOCH_MS=Date.UTC(1899,11,30);
const DAY_MS=86400000;

// Локальные год/месяц/день/час/минута для момента времени в заданном поясе.
export function localParts(ts=Date.now(),tz=DEFAULT_TZ){
 const f=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const p={};for(const x of f.formatToParts(new Date(ts)))if(x.type!=='literal')p[x.type]=Number(x.value);
 return {year:p.year,month:p.month,day:p.day,hour:p.hour%24,minute:p.minute};
}
export function daysInMonth(year,month){return new Date(Date.UTC(year,month,0)).getUTCDate();}
export function monthKey({year,month}){return year+'-'+String(month).padStart(2,'0');}
export function parseMonthKey(key){const m=/^(\d{4})-(\d{2})$/.exec(key||'');return m?{year:Number(m[1]),month:Number(m[2])}:null;}
export function prevMonth({year,month}){return month===1?{year:year-1,month:12}:{year,month:month-1};}
export function sameMonth(a,b){return !!a&&!!b&&a.year===b.year&&a.month===b.month;}
export function dateKey({year,month,day}){return monthKey({year,month})+'-'+String(day).padStart(2,'0');}
export function parseDateKey(key){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(key||'');return m?{year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}:null;}

// Серийная дата Google Sheets (дней с 30.12.1899) ↔ календарная дата.
export function serialToDate(serial){
 const d=new Date(SHEETS_EPOCH_MS+Math.floor(serial)*DAY_MS);
 return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
}
export function dateToSerial({year,month,day}){return Math.round((Date.UTC(year,month-1,day)-SHEETS_EPOCH_MS)/DAY_MS);}

// «За месяц» из журнала: серийная дата, «09.2026», «01.09.2026», «2026-09» или «2026-09-01».
export function parseMonth(value){
 if(value==null||value==='')return null;
 if(typeof value==='number'&&Number.isFinite(value)){const d=serialToDate(value);return {year:d.year,month:d.month};}
 if(value instanceof Date&&Number.isFinite(value.getTime()))return {year:value.getUTCFullYear(),month:value.getUTCMonth()+1};
 const s=String(value).trim();let m;
 if((m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)))return check({year:+m[3],month:+m[2]});
 if((m=/^(\d{1,2})\.(\d{4})$/.exec(s)))return check({year:+m[2],month:+m[1]});
 if((m=/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s)))return check({year:+m[1],month:+m[2]});
 return null;
 function check(r){return r.month>=1&&r.month<=12?r:null;}
}
// Полная дата из ячейки (серийная или «05.10.2026»).
export function parseDate(value){
 if(value==null||value==='')return null;
 if(typeof value==='number'&&Number.isFinite(value))return serialToDate(value);
 const s=String(value).trim();let m;
 if((m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)))return {year:+m[3],month:+m[2],day:+m[1]};
 if((m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)))return {year:+m[1],month:+m[2],day:+m[3]};
 return null;
}
// День оплаты: число 1..31; строки вида «5», «5-го», «05».
export function parseDay(value){
 if(value==null||value==='')return null;
 const n=typeof value==='number'?value:Number(String(value).replace(/[^\d]/g,''));
 return Number.isInteger(n)&&n>=1&&n<=31?n:null;
}
// Сумма: число или текст «55 000,00 ₽», «1 647,00», «18794.22».
export function parseAmount(value){
 if(value==null||value==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 let s=String(value).replace(/[^\d,.\-]/g,'');
 if(!s)return null;
 if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
 else if(s.includes(','))s=s.replace(',','.');
 const n=Number(s);return Number.isFinite(n)?n:null;
}
export function formatAmount(n){
 if(n==null||!Number.isFinite(n))return '—';
 const neg=n<0;n=Math.abs(n);
 const whole=Math.floor(n),frac=Math.round((n-whole)*100);
 let w=String(whole).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
 if(frac)w+=','+String(frac).padStart(2,'0');
 return (neg?'-':'')+w+' ₽';
}
export function formatDate({year,month,day}){return String(day).padStart(2,'0')+'.'+String(month).padStart(2,'0')+'.'+year;}
const MONTHS_GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_NOM=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
export function monthName({year,month},form='nom'){return (form==='gen'?MONTHS_GEN:MONTHS_NOM)[month-1]+' '+year;}
export function dayOrdinal(day){return day+'-го';}
export function plural(n,one,few,many){const a=Math.abs(n)%100,b=a%10;if(a>10&&a<20)return many;if(b>1&&b<5)return few;if(b===1)return one;return many;}
export function daysWord(n){return n+' '+plural(n,'день','дня','дней');}
