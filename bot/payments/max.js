// Клиент MAX Bot API (platform-api2.max.ru). Токен только в заголовке Authorization, в логи не попадает.
// Схема методов сверена с официальным SDK @maxhub/max-bot-api 1.0.1: GET /updates, POST /messages, POST /answers, POST /uploads.
export class MaxApiError extends Error{
 constructor(status,data){super(`MAX API ${status}: ${data?.message||data?.code||'ошибка'}`);this.status=status;this.code=data?.code;this.data=data;}
}
export class MaxApi{
 constructor(token,{baseUrl='https://platform-api2.max.ru',fetch:fetchFn=globalThis.fetch}={}){
  if(!token)throw new Error('MAX_BOT_TOKEN не задан');
  this.token=token;this.baseUrl=baseUrl;this.fetch=fetchFn;
 }
 async call(method,path,{query,body,signal,timeoutMs}={}){
  const url=new URL(path,this.baseUrl);
  for(const [k,v] of Object.entries(query||{}))if(v!=null&&v!=='')url.searchParams.set(k,String(v));
  const init={method,headers:{Authorization:this.token},signal};
  if(body!==undefined){init.body=JSON.stringify(body);init.headers['content-type']='application/json';}
  if(!signal&&timeoutMs)init.signal=AbortSignal.timeout(timeoutMs);
  const res=await this.fetch(url.href,init);
  let data=null;try{data=await res.json();}catch(e){data={code:'unexpected.response',message:'ответ не JSON'};}
  if(res.status!==200)throw new MaxApiError(res.status,data);
  return data;
 }
 getMe(){return this.call('GET','me',{timeoutMs:15000});}
 getChat(chatId){return this.call('GET',`chats/${chatId}`,{timeoutMs:15000});}
 // Длинный опрос: timeout в секундах (сервер держит соединение), marker — курсор.
 getUpdates({marker,limit=100,timeout=30,types}={}){
  return this.call('GET','updates',{query:{marker,limit,timeout,types:Array.isArray(types)?types.join(','):types},timeoutMs:(timeout+15)*1000});
 }
 // chatId или userId; attachments — массив вложений (inline_keyboard и т.п.); format — 'markdown' | 'html' | null.
 async sendMessage({chatId,userId,text,attachments,format,notify=true}){
  const body={text,notify};
  if(attachments?.length)body.attachments=attachments;
  if(format)body.format=format;
  const r=await this.call('POST','messages',{query:{chat_id:chatId,user_id:userId},body,timeoutMs:30000});
  return r.message;
 }
 answerCallback(callbackId,{notification,message}={}){
  const body={};if(notification)body.notification=notification;if(message)body.message=message;
  return this.call('POST','answers',{query:{callback_id:callbackId},body,timeoutMs:15000});
 }
 // Скачать вложение (фото чека) по url из payload.
 async download(url,{maxBytes=20*1024*1024}={}){
  const res=await this.fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!res.ok)throw new Error(`Не удалось скачать вложение: HTTP ${res.status}`);
  const buf=Buffer.from(await res.arrayBuffer());
  if(buf.length>maxBytes)throw new Error('Вложение слишком большое');
  return {buffer:buf,contentType:res.headers.get('content-type')||'application/octet-stream'};
 }
}
export const keyboard=rows=>({type:'inline_keyboard',payload:{buttons:rows.map(r=>r.map(b=>typeof b==='string'?{type:'callback',text:b,payload:b}:({type:'callback',...b})))}});
export const button=(text,payload)=>({type:'callback',text,payload});
export const linkButton=(text,url)=>({type:'link',text,url});
// Экранирование для format:'markdown' (как в официальном SDK).
export const escapeMarkdown=t=>String(t).replace(/([_*[\]()~`>#+=|{}.!\\-])/g,'\\$1');

// Удобные извлечения из обновлений.
export function imageAttachments(message){return (message?.body?.attachments||[]).filter(a=>a?.type==='image'&&a.payload?.url);}
export function senderName(user){if(!user)return '';const n=[user.first_name,user.last_name].filter(Boolean).join(' ').trim();return n||user.name||(user.username?'@'+user.username:'id '+user.user_id);}
