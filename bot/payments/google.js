// Google Sheets и Drive через сервисный аккаунт, без библиотек: JWT RS256 на node:crypto, запросы через fetch.
// Ключ сервисного аккаунта читается из файла или переменной окружения и никуда не пишется.
import {createSign} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const TOKEN_URL='https://oauth2.googleapis.com/token';
export const SCOPES={sheets:'https://www.googleapis.com/auth/spreadsheets',driveFile:'https://www.googleapis.com/auth/drive.file',driveRead:'https://www.googleapis.com/auth/drive.readonly'};
const b64url=s=>Buffer.from(s).toString('base64url');

export class GoogleApiError extends Error{
 constructor(status,body,what){super(`Google API ${status} (${what}): ${body?.error?.message||String(body).slice(0,200)}`);this.status=status;this.body=body;}
}
export async function loadServiceAccount({file,json}={}){
 const raw=json||(file?await readFile(file,'utf8'):null);
 if(!raw)throw new Error('Не задан ключ сервисного аккаунта (GOOGLE_SERVICE_ACCOUNT_FILE или GOOGLE_SERVICE_ACCOUNT_JSON)');
 const sa=typeof raw==='string'?JSON.parse(raw):raw;
 if(!sa.client_email||!sa.private_key)throw new Error('Ключ сервисного аккаунта без client_email/private_key');
 return {clientEmail:sa.client_email,privateKey:sa.private_key};
}
export class GoogleAuth{
 constructor({clientEmail,privateKey,scopes,fetch:fetchFn=globalThis.fetch,now=()=>Date.now()}){
  this.clientEmail=clientEmail;this.privateKey=privateKey;this.scopes=scopes;this.fetch=fetchFn;this.now=now;this.cached=null;
 }
 jwt(){
  const iat=Math.floor(this.now()/1000);
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claims=b64url(JSON.stringify({iss:this.clientEmail,scope:this.scopes.join(' '),aud:TOKEN_URL,iat,exp:iat+3600}));
  const sig=createSign('RSA-SHA256').update(header+'.'+claims).sign(this.privateKey).toString('base64url');
  return header+'.'+claims+'.'+sig;
 }
 async token(){
  if(this.cached&&this.cached.exp-60000>this.now())return this.cached.value;
  const res=await this.fetch(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:this.jwt()}),signal:AbortSignal.timeout(20000)});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw new GoogleApiError(res.status,body,'oauth token');
  this.cached={value:body.access_token,exp:this.now()+(body.expires_in||3600)*1000};
  return this.cached.value;
 }
 async request(url,{method='GET',query,body,headers={},raw=false}={}){
  const u=new URL(url);
  for(const [k,v] of Object.entries(query||{})){if(v==null)continue;if(Array.isArray(v))v.forEach(x=>u.searchParams.append(k,x));else u.searchParams.set(k,String(v));}
  const init={method,headers:{Authorization:'Bearer '+await this.token(),...headers},signal:AbortSignal.timeout(60000)};
  if(body!==undefined){if(Buffer.isBuffer(body)||typeof body==='string')init.body=body;else{init.body=JSON.stringify(body);init.headers['content-type']='application/json';}}
  const res=await this.fetch(u.href,init);
  if(raw){if(!res.ok)throw new GoogleApiError(res.status,await res.text().catch(()=>''),method+' '+u.pathname);return res;}
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new GoogleApiError(res.status,data,method+' '+u.pathname);
  return data;
 }
}

export class Sheets{
 constructor(auth,spreadsheetId){if(!spreadsheetId)throw new Error('SPREADSHEET_ID не задан');this.auth=auth;this.id=spreadsheetId;this.base='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId);this.sheetIds=null;}
 // Значения без форматирования: суммы — числа, даты — серийные номера. Так разбор не зависит от локали таблицы.
 async batchGet(ranges){
  const r=await this.auth.request(this.base+'/values:batchGet',{query:{ranges,valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}});
  return (r.valueRanges||[]).map(v=>v.values||[]);
 }
 async meta(){
  const r=await this.auth.request(this.base,{query:{fields:'properties.title,properties.locale,properties.timeZone,sheets.properties.sheetId,sheets.properties.title'}});
  this.sheetIds=Object.fromEntries((r.sheets||[]).map(s=>[s.properties.title,s.properties.sheetId]));
  return {title:r.properties?.title,locale:r.properties?.locale,timeZone:r.properties?.timeZone,sheets:this.sheetIds};
 }
 async sheetId(title){if(!this.sheetIds)await this.meta();const id=this.sheetIds[title];if(id==null)throw new Error(`Лист «${title}» не найден`);return id;}
 // Добавить строку в конец таблицы листа. RAW: строки остаются строками, числа — числами. Возвращает номер новой строки.
 async appendRow(sheetTitle,values){
  const range=`'${sheetTitle}'!A:H`;
  const r=await this.auth.request(this.base+'/values/'+encodeURIComponent(range)+':append',{method:'POST',query:{valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',includeValuesInResponse:'false'},body:{range,majorDimension:'ROWS',values:[values]}});
  const m=/!A(\d+)/.exec(r.updates?.updatedRange||'');
  return {row:m?Number(m[1]):null,updatedRange:r.updates?.updatedRange};
 }
 // Перенести на новую строку формулу колонки C и формат A:H с образцовой строки (первая строка данных).
 // Так формула «Статья» и форматы дат/сумм совпадают с тем, что уже есть в журнале, независимо от локали.
 async copyRowStyle(sheetTitle,toRow,{fromRow=2,formulaCols=[2],formatCols=[0,8]}={}){
  const sheetId=await this.sheetId(sheetTitle);
  const rng=(row,c0,c1)=>({sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:c0,endColumnIndex:c1});
  const requests=[{copyPaste:{source:rng(fromRow,formatCols[0],formatCols[1]),destination:rng(toRow,formatCols[0],formatCols[1]),pasteType:'PASTE_FORMAT',pasteOrientation:'NORMAL'}}];
  for(const c of formulaCols)requests.push({copyPaste:{source:rng(fromRow,c,c+1),destination:rng(toRow,c,c+1),pasteType:'PASTE_FORMULA',pasteOrientation:'NORMAL'}});
  return this.auth.request(this.base+':batchUpdate',{method:'POST',body:{requests}});
 }
}

export class Drive{
 constructor(auth){this.auth=auth;}
 // Загрузка файла в папку: multipart/related (метаданные + содержимое) одним запросом.
 async upload({name,mimeType='application/octet-stream',buffer,folderId}){
  const boundary='shtab-'+Math.random().toString(36).slice(2);
  const meta=JSON.stringify({name,parents:folderId?[folderId]:undefined});
  const body=Buffer.concat([
   Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`),
   buffer,Buffer.from(`\r\n--${boundary}--`)]);
  return this.auth.request('https://www.googleapis.com/upload/drive/v3/files',{method:'POST',query:{uploadType:'multipart',fields:'id,name,webViewLink',supportsAllDrives:'true'},body,headers:{'content-type':`multipart/related; boundary=${boundary}`}});
 }
 async list({folderId,nameContains,modifiedAfter,pageSize=50}){
  const q=[`'${folderId}' in parents`,'trashed = false'];
  if(nameContains)q.push(`name contains '${nameContains.replace(/'/g,"\\'")}'`);
  if(modifiedAfter)q.push(`modifiedTime > '${modifiedAfter}'`);
  const r=await this.auth.request('https://www.googleapis.com/drive/v3/files',{query:{q:q.join(' and '),pageSize,orderBy:'modifiedTime',fields:'files(id,name,mimeType,modifiedTime,webViewLink)',supportsAllDrives:'true',includeItemsFromAllDrives:'true'}});
  return r.files||[];
 }
 // Текст документа: Google Документы экспортируем, text/* скачиваем. PDF и картинки текстом не отдаются — вернём null.
 async text(file){
  if(file.mimeType==='application/vnd.google-apps.document'){const res=await this.auth.request(`https://www.googleapis.com/drive/v3/files/${file.id}/export`,{query:{mimeType:'text/plain'},raw:true});return res.text();}
  if(/^text\//.test(file.mimeType||'')){const res=await this.auth.request(`https://www.googleapis.com/drive/v3/files/${file.id}`,{query:{alt:'media',supportsAllDrives:'true'},raw:true});return res.text();}
  return null;
 }
}
export function extensionFor(contentType){return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','application/pdf':'pdf'})[String(contentType).split(';')[0].trim()]||'bin';}
