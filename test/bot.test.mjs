import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import {BotTransport,channelPermissions,nonceFor} from '../lib/bot-transport.mjs';
import {BotService} from '../desktop/bot-service.mjs';
import {TokenVault} from '../desktop/token-vault.mjs';
import {botSettings,botRuntime,readSettings,saveSettings} from '../lib/bot-settings.mjs';
import {digest} from '../lib/core.mjs';
import {resolveCodexExecutable} from '../lib/codex-executable.mjs';
import {execFile} from 'node:child_process';
const guildId='1000000000000000001',channelId='1000000000000000002',botId='1000000000000000009',humanId='1000000000000000008';
const targetThread='00000000-0000-4000-8000-000000000001';
const settings={transport:'bot',guildId,channelId,targetThread};
const raw=(n,content='Salut',author={id:humanId,username:'Membre',bot:false})=>({id:String(1000000000000000004n+BigInt(n)),channel_id:channelId,guild_id:guildId,author,content,type:0,attachments:[]});
function fake(){
 const f={messages:[],calls:[],posts:[],channel:{id:channelId,guild_id:guildId,type:0,name:'salon',permission_overwrites:[]},roles:[{id:guildId,permissions:'68608'}],member:{user:{id:botId},roles:[]},postError:null};
 f.rest={setToken(){return this;},async get(route,options={}){
  f.calls.push(route);if(f.beforeGet)await f.beforeGet(route,options);
  if(route==='/users/@me')return {id:botId,bot:true};
  if(route==='/applications/@me')return {id:botId,bot:{id:botId}};
  if(route===`/applications/${botId}/emojis`)return {items:f.applicationEmojis||[]};
  if(route===`/guilds/${guildId}/emojis`)return f.guildEmojis||[];
  if(route===`/channels/${channelId}`)return f.channel;
  if(route===`/guilds/${guildId}/roles`)return f.roles;
  if(route===`/guilds/${guildId}/members/${botId}`)return f.member;
  if(route===`/channels/${channelId}/messages`){const before=options.query?.get('before');return f.messages.filter(m=>!before||BigInt(m.id)<BigInt(before)).slice(-100).reverse();}
  if(route.startsWith(`/channels/${channelId}/messages/`)){const m=f.messages.find(m=>m.id===route.split('/').at(-1));if(!m)throw new Error('404');return m;}
  throw new Error('Forbidden route in test: '+route);
 },async post(route,options){f.posts.push({route,...options});if(f.postError)throw f.postError;const message={...raw(49+f.posts.length,options.body.content,{id:botId,username:'Astro',bot:true}),nonce:options.body.nonce};f.messages.push(message);return message;}};
 f.gateway=new EventEmitter();f.gateway.connect=async()=>{};f.gateway.destroy=async()=>{};
 f.options={settings,token:()=> 'FAKE_TEST_TOKEN_NOT_A_CREDENTIAL',restFactory:()=>f.rest,gatewayFactory:options=>{f.gatewayOptions=options;return f.gateway;}};
 return f;
}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astro-bot-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function service(t,f,extra={}){
 const data=temp(t),dispatches=[];
 const s=new BotService({data,settings,config:{debounceMs:999999,maxWaitMs:999999},vault:{has:()=>true,available:()=>true,read:()=> 'FAKE_TEST_TOKEN_NOT_A_CREDENTIAL'},mailbox:false,dispatch:async id=>dispatches.push(id),transportFactory:options=>new BotTransport({...options,restFactory:f.options.restFactory,gatewayFactory:f.options.gatewayFactory}),...extra});
 t.after(()=>s.dispose());return {s,data,dispatches};
}

test('observe then wake returns the final non-starting status published to the UI',async t=>{
 const updates=[],f=fake(),{s}=service(t,f,{publish:status=>updates.push(status)});
 for(const mode of ['observe','wake']){
  const result=await s.mode(mode);
  assert.equal(result.mode,mode);assert.equal(result.starting,false);
  assert.deepEqual(result,updates.at(-1));assert.equal(s.status().starting,false);
 }
});

test('settings whitelist, authorized default, incomplete configuration and isolated runtimes',t=>{
 const data=temp(t);assert.equal(readSettings(data).channelId,'');
 saveSettings(data,{transport:'bot',guildId:'',channelId:'',token:'MUST_NOT_PERSIST'});
 assert.deepEqual(readSettings(data),{transport:'bot',guildId:'',channelId:'',targetThread:'',codexExecutable:''});assert.ok(!fs.readFileSync(path.join(data,'transport.json'),'utf8').includes('MUST_NOT'));
 assert.notEqual(botRuntime(data,settings),path.join(data,'runtime'));
 assert.throws(()=>botSettings({...settings,channelId:'../other'}));
});
test('vault persists encrypted bytes only, never accepts unavailable encryption',t=>{
 const data=temp(t),value='FAKE_TEST_TOKEN_NOT_A_CREDENTIAL';
 const safe={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from([...Buffer.from(s)].map(n=>n^0xa5)),decryptString:b=>Buffer.from([...b].map(n=>n^0xa5)).toString()};
 const vault=new TokenVault(data,safe);vault.save(value);assert.ok(vault.has());assert.equal(vault.read(),value);assert.ok(!fs.readFileSync(vault.file).includes(Buffer.from(value)));
 safe.isEncryptionAvailable=()=>false;assert.throws(()=>vault.save(value),/Chiffrement/);assert.throws(()=>vault.read());vault.remove();assert.equal(vault.has(),false);
});
test('missing token or IDs performs no Discord request and no dispatch',async t=>{
 const f=fake(),{s,dispatches}=service(t,f,{settings:{transport:'bot',guildId:'',channelId:'',targetThread},vault:{has:()=>false,available:()=>true,read:()=>{throw new Error('never');}}});
 assert.equal(s.status().configurationBlocked,true);await assert.rejects(s.mode('wake'),/incomplète/);assert.equal(f.calls.length,0);assert.equal(dispatches.length,0);
});
test('target guild/type and permissions are checked before reading messages',async()=>{
 for(const change of [f=>f.channel.guild_id='1000000000000000005',f=>f.channel.type=11,f=>f.roles[0].permissions='1024']){
  const f=fake();change(f);const transport=new BotTransport(f.options);await assert.rejects(transport.connect());assert.ok(f.calls.every(p=>!p.endsWith('/messages')));await transport.dispose();
 }
 assert.equal(channelPermissions(guildId,[{id:guildId,permissions:'68608'}],{user:{id:botId},roles:[]},{permission_overwrites:[{type:1,id:botId,deny:'2048',allow:'0'}]}),false);
});
test('Gateway filters foreign guild/channel, self, bots; human edits/deletes trigger refresh',async()=>{
 const f=fake();let changes=0;const transport=new BotTransport({...f.options,onChange:()=>changes++});await transport.connect();
 for(const d of [{...raw(1),guild_id:'other'},{...raw(1),channel_id:'other'},raw(1,'bot',{id:botId,username:'Astro',bot:true}),raw(1,'otherbot',{id:humanId,username:'Bot',bot:true})])transport.event({t:'MESSAGE_CREATE',d});
 assert.equal(changes,0);
 for(const t of ['MESSAGE_CREATE','MESSAGE_UPDATE','MESSAGE_DELETE','MESSAGE_DELETE_BULK'])transport.event({t,d:{guild_id:guildId,channel_id:channelId,...(t==='MESSAGE_CREATE'?raw(1):{})}});
 assert.equal(changes,4);assert.equal(f.gatewayOptions.intents,33281);await transport.dispose();
});
test('empty baseline, first human message, bot anchors, edits and all-message deletion',async t=>{
 const f=fake(),{s,dispatches}=service(t,f);await s.mode('wake');assert.equal(s.engine.s.baseline,true);assert.equal(s.engine.s.cursor,null);
 f.messages=[raw(1),raw(2,'bot',{id:'1000000000000000007',username:'Bot',bot:true})];await s.sync();await s.engine.flush();assert.equal(dispatches.length,1);assert.equal(s.engine.s.queue.length,1);
 f.messages[0]=raw(1,'Modifié');await s.sync();assert.equal(s.engine.s.queue[0].text,'Modifié');
 f.messages=[];await s.sync();assert.equal(s.engine.s.queue.length,0);assert.equal(s.engine.mode,'wake');assert.equal(s.engine.s.cursor,null);
});
test('nonce journal precedes POST; one send, ID re-read, replay never POSTs again',async()=>{
 const f=fake(),saved=[];const transport=new BotTransport({...f.options,saveAttempts:a=>saved.push(structuredClone(a))});await transport.connect();
 const intent={id:'outbox-one',text:'**Texte brut API**',expected:digest((await transport.snapshot()).messages)};
 const post=f.rest.post;f.rest.post=async(...args)=>{assert.equal(saved.at(-1)[intent.id].status,'attempted');return post(...args);};
 const result=await transport.send(intent,{allowed:()=>true});assert.equal(result.status,'verified');assert.equal(result.messageId,raw(50).id);
 assert.equal(f.posts[0].body.enforce_nonce,true);assert.deepEqual(f.posts[0].body.allowed_mentions,{parse:[],replied_user:false});assert.equal(f.posts[0].body.nonce,nonceFor(intent.id));
 assert.equal((await transport.send(intent,{allowed:()=>true})).status,'verified');assert.equal(f.posts.length,1);await transport.dispose();
});
test('uncertain request survives restart, sanitizes errors, never retries (including 429)',async()=>{
 for(const failure of ['timeout FAKE_TEST_TOKEN_NOT_A_CREDENTIAL','429']){
  const f=fake(),transport=new BotTransport(f.options);await transport.connect();const intent={id:'uncertain',text:'Réponse',expected:digest((await transport.snapshot()).messages)};f.postError=new Error(failure);
  const receipt=await transport.send(intent,{allowed:()=>true});assert.equal(receipt.status,'uncertain');assert.ok(!JSON.stringify(receipt).includes('FAKE_TEST'));
  const state=structuredClone(transport.attempts);await transport.dispose();
  const restarted=new BotTransport({...f.options,attempts:state});await restarted.connect();assert.equal((await restarted.send(intent,{allowed:()=>true})).status,'uncertain');assert.equal(f.posts.length,1);await restarted.dispose();
 }
});
test('pause during preflight prevents POST even if an aborted GET completes',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();const intent={id:'paused',text:'Réponse',expected:digest((await transport.snapshot()).messages)};
 let release,started;const waiting=new Promise(r=>started=r);f.beforeGet=async route=>{if(route.endsWith('/messages')){started();await new Promise(r=>release=r);}};
 const sending=transport.send(intent,{allowed:()=>transport.available});await waiting;await transport.pause();release();
 assert.equal((await sending).status,'notSent');assert.equal(f.posts.length,0);assert.equal(Object.keys(transport.attempts).length,0);await transport.dispose();
});
test('interrupted service pauses, then explicit reconnect preserves queued work',async t=>{
 const f=fake(),{s}=service(t,f);await s.mode('wake');f.messages=[raw(1)];await s.sync();
 f.gateway.emit('closed',1006,0);assert.equal(s.engine.mode,'paused');assert.equal(s.engine.s.queue.length,1);
 await s.mode('wake');assert.equal(s.engine.mode,'wake');assert.equal(s.engine.s.queue.length,1);assert.equal(s.status().targetThread,targetThread);
});
test('known ID reconciliation does not send; wrong bot/content stays ambiguous',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();const intent={id:'proof',text:'Réponse',expected:digest((await transport.snapshot()).messages)};
 await transport.send(intent,{allowed:()=>true});await transport.pause();await transport.authorize();
 assert.equal((await transport.reconcile(intent)).status,'published');f.messages[0].content='Autre';assert.equal((await transport.reconcile(intent)).status,'ambiguous');assert.equal(f.posts.length,1);await transport.dispose();
});
test('current Codex install is resolved instead of a stale versioned executable',t=>{
 const data=temp(t),file=path.join(data,'OpenAI','Codex','bin','current','codex.exe');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');assert.equal(resolveCodexExecutable('',{localAppData:data}),file);
});

test('pause while unlocking token prevents any REST or Gateway creation',async()=>{
 const f=fake();let release;const transport=new BotTransport({...f.options,token:()=>new Promise(r=>release=r)});
 const starting=transport.connect();await transport.pause();release('FAKE_TEST_TOKEN_NOT_A_CREDENTIAL');
 await assert.rejects(starting,/annulée/);assert.equal(transport.rest,null);assert.equal(f.calls.length,0);assert.equal(f.gatewayOptions,undefined);await transport.dispose();
});

test('pause during authorize invalidates late identity before Gateway or reads',async t=>{
 const f=fake(),{s}=service(t,f);let release,started;const reached=new Promise(r=>started=r);
 f.beforeGet=async route=>{if(route==='/users/@me'){started();await new Promise(r=>release=r);}};
 const starting=s.mode('wake');await reached;await s.mode('paused');release();await assert.rejects(starting);
 assert.equal(s.status().starting,false);assert.equal(s.status().connected,false);
 assert.equal(s.engine.mode,'paused');assert.equal(f.gatewayOptions,undefined);assert.equal(f.calls.length,1);assert.equal(f.posts.length,0);
});
test('REST preflight failure makes no POST and journal capacity never drops uncertain evidence',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();const intent={id:'capacity',text:'Réponse',expected:digest((await transport.snapshot()).messages)};
 f.beforeGet=async()=>{throw new Error('429');};assert.equal((await transport.send(intent,{allowed:()=>true})).status,'notSent');assert.equal(f.posts.length,0);assert.equal(Object.keys(transport.attempts).length,0);
 f.beforeGet=null;for(let n=0;n<1000;n++)transport.attempts[String(n)]={status:'attempted'};
 assert.equal((await transport.send(intent,{allowed:()=>true})).status,'notSent');assert.equal(Object.keys(transport.attempts).length,1000);assert.equal(f.posts.length,0);await transport.dispose();
});
test('pagination covers oldest pending despite recent anchor and fails closed beyond 500',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();f.messages=Array.from({length:250},(_,i)=>raw(i+1));f.messages[0].content='Ancienne demande modifiée';
 const snapshot=await transport.snapshot({anchors:[raw(1).id,raw(240).id]});assert.equal(snapshot.messages[0].text,'Ancienne demande modifiée');assert.equal(snapshot.messages.length,250);
 assert.equal(f.calls.filter(p=>p.endsWith('/messages')).length,3);
 f.messages=Array.from({length:650},(_,i)=>raw(i+1));await assert.rejects(transport.snapshot({anchors:[raw(1).id,raw(640).id]}),/500/);await transport.dispose();
});
test('changing bot identity cannot reuse queued work in the same channel',async t=>{
 const f=fake(),{s,data}=service(t,f);await s.mode('wake');f.messages=[raw(1)];await s.sync();await s.dispose();
 const original=f.rest.get;f.rest.get=async(route,options)=>route==='/users/@me'?{id:'1000000000000000007',bot:true}:route===`/guilds/${guildId}/members/1000000000000000007`?{user:{id:'1000000000000000007'},roles:[]}:original(route,options);
 const second=service(t,f,{data}).s;await assert.rejects(second.mode('wake'),/autre bot/);assert.equal(second.engine.s.queue.length,1);assert.equal(second.engine.mode,'paused');assert.equal(f.posts.length,0);
});

test('changed POST content saves identity-checked ID but stays uncertain without retry',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();
 const intent={id:'external-emoji',text:'Test 🙂',expected:digest((await transport.snapshot()).messages)};
 const post=f.rest.post;f.rest.post=async(...args)=>{const message=await post(...args);message.content='Test :hehe:';delete message.nonce;return message;};
 const receipt=await transport.send(intent,{allowed:()=>true});
 assert.equal(receipt.status,'uncertain');assert.equal(receipt.error,'Accusé Discord non conforme');
 assert.equal(transport.attempts[intent.id].messageId,raw(50).id);
 assert.equal((await transport.reconcile(intent)).status,'ambiguous');
 assert.equal((await transport.send(intent,{allowed:()=>true})).status,'uncertain');assert.equal(f.posts.length,1);await transport.dispose();
});

test('custom emoji is refused before POST or journal; Unicode remains allowed',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();
 for(const text of ['Test <:hehe:1000000000000000003>','Test <a:hehe:1000000000000000003>']){
  const result=await transport.send({id:'blocked',text},{allowed:()=>true});assert.equal(result.status,'notSent');
 }
 assert.equal(f.posts.length,0);assert.deepEqual(transport.attempts,{});
 const result=await transport.send({id:'unicode',text:'Test 🙂',expected:digest((await transport.snapshot()).messages)},{allowed:()=>true});assert.equal(result.status,'verified');await transport.dispose();
});

test('owner observed recovery verifies exact evidence and stays paused with zero POST',async t=>{
 const f=fake(),{s}=service(t,f);await s.mode('observe');await s.mode('paused');
 const text='Test <:hehe:1000000000000000003>',observedText='Test :hehe:',id='legacy-uncertain',messageId=raw(50).id;
 f.messages=[raw(50,observedText,{id:botId,username:'Astro',bot:true})];
 s.engine.s.outbox={id,status:'uncertain',text,requestIds:[raw(1).id]};s.engine.s.queue=[{id:raw(1).id},{id:raw(2).id}];
 s.transport.attempts[id]={nonce:nonceFor(id),textHash:digest(text),status:'attempted'};
 const command={outboxId:id,messageId,observedText,acceptObserved:true};
 for(const patch of [{acceptObserved:false},{outboxId:'wrong'},{messageId:raw(51).id},{observedText:'Wrong'}]){
  await assert.rejects(s.engine.recoverObserved({...command,...patch}));assert.equal(s.engine.s.outbox.id,id);assert.equal(s.engine.s.queue.length,2);
 }
 const original={...f.messages[0]};
 for(const patch of [{nonce:'wrong'},{author:{id:humanId,username:'other'}},{channel_id:raw(99).id},{guild_id:raw(99).id}]){
  f.messages[0]={...original,...patch};await assert.rejects(s.engine.recoverObserved(command));assert.equal(s.engine.s.outbox.id,id);
 }
 f.messages[0]=original;
 const result=await s.engine.recoverObserved(command);assert.equal(result.status,'owner-accepted');assert.equal(result.resumed,false);assert.equal(s.engine.mode,'paused');
 assert.equal(s.engine.s.outbox,null);assert.deepEqual(s.engine.s.queue,[{id:raw(2).id}]);assert.equal(s.engine.s.lastSent.text,observedText);
 assert.equal(s.transport.attempts[id].status,'owner-accepted');assert.equal(s.transport.attempts[id].nonce,nonceFor(id));assert.equal(f.posts.length,0);
});

test('ack proof keeps emoji text and nonce independent and strict',()=>{
 const f=fake(),transport=new BotTransport(f.options);transport.botId=botId;
 const intent={text:'Test <:hehe:1000000000000000003>'},attempt={nonce:'abc123'};
 const message={...raw(50,intent.text,{id:botId,username:'Astro',bot:true}),nonce:attempt.nonce};
 assert.equal(transport.proof(message,intent,attempt),true);
 assert.equal(transport.proof({...message,nonce:undefined},intent,attempt),true);
 assert.equal(transport.proof({...message,nonce:'different'},intent,attempt),false);
 assert.equal(transport.proof({...message,content:'Test :hehe:'},intent,attempt),false);
 assert.equal(transport.proof({...message,content:'Test <:renamed:1000000000000000003>'},intent,attempt),false);
});

test('untrusted POST identity never persists message ID',async()=>{
 for(const patch of [{nonce:'wrong'},{author:{id:humanId,username:'other'}},{channel_id:raw(99).id},{id:'invalid'}]){
  const f=fake(),transport=new BotTransport(f.options);await transport.connect();const post=f.rest.post;
  f.rest.post=async(...args)=>({...await post(...args),...patch});
  const result=await transport.send({id:'bad-ack',text:'Test',expected:digest((await transport.snapshot()).messages)},{allowed:()=>true});
  assert.equal(result.status,'uncertain');assert.equal(transport.attempts['bad-ack'].messageId,undefined);assert.equal(f.posts.length,1);await transport.dispose();
 }
});

test('pause cancels in-flight owner recovery without acknowledging or sending',async t=>{
 const f=fake(),{s}=service(t,f);await s.mode('observe');await s.mode('paused');
 const text='Old text',id='cancel-recovery',messageId=raw(50).id;f.messages=[raw(50,'Observed',{id:botId,username:'Astro',bot:true})];
 s.engine.s.outbox={id,status:'uncertain',text,requestIds:[]};s.transport.attempts[id]={nonce:nonceFor(id),textHash:digest(text),status:'attempted'};
 let release,started;const reached=new Promise(r=>started=r);
 f.beforeGet=async route=>{if(route.endsWith('/messages/'+messageId)){started();await new Promise(r=>release=r);}};
 const recovering=s.engine.recoverObserved({outboxId:id,messageId,observedText:'Observed',acceptObserved:true});
 await reached;await s.mode('paused');release();await assert.rejects(recovering);
 assert.equal(s.engine.s.outbox.id,id);assert.equal(s.engine.busy,false);assert.equal(s.transport.attempts[id].status,'attempted');assert.equal(f.posts.length,0);
});

test('emoji catalogue limits fields, guild roles and availability; known app and guild send',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();
 f.applicationEmojis=[{id:raw(70).id,name:'astro',animated:true,user:{id:'PRIVATE'}}];
 f.guildEmojis=[{id:raw(71).id,name:'guild',animated:false},{id:raw(72).id,name:'locked',roles:[raw(99).id]},{id:raw(73).id,name:'gone',available:false}];
 assert.deepEqual(await transport.emojis(),{application:[{id:raw(70).id,name:'astro',animated:true}],guild:[{id:raw(71).id,name:'guild',animated:false}]});
 for(const [i,text] of [`<a:astro:${raw(70).id}>`,`<:guild:${raw(71).id}>`].entries()){
  const result=await transport.send({id:'known'+i,text,expected:digest((await transport.snapshot()).messages)},{allowed:()=>true});assert.equal(result.status,'verified');
 }
 for(const [i,text] of [`<:astro:${raw(70).id}>`,`<a:wrong:${raw(70).id}>`,`<:locked:${raw(72).id}>`,`<:gone:${raw(73).id}>`,`<:external:${raw(99).id}>`].entries()){
  assert.equal((await transport.send({id:'unknown'+i,text},{allowed:()=>true})).status,'notSent');assert.equal(transport.attempts['unknown'+i],undefined);
 }
 assert.equal(f.posts.length,2);await transport.dispose();
});

test('emoji catalogue is read fresh before each custom send and errors fail before POST',async()=>{
 const f=fake(),transport=new BotTransport(f.options);await transport.connect();f.applicationEmojis=[{id:raw(70).id,name:'astro'}];
 await transport.emojis();f.applicationEmojis=[];
 assert.equal((await transport.send({id:'removed',text:`<:astro:${raw(70).id}>`},{allowed:()=>true})).status,'notSent');
 f.beforeGet=async route=>{if(route.endsWith('/emojis'))throw new Error('429 FAKE_TEST_TOKEN_NOT_A_CREDENTIAL');};
 const result=await transport.send({id:'unavailable',text:`<:astro:${raw(70).id}>`},{allowed:()=>true});
 assert.equal(result.status,'notSent');assert.ok(!JSON.stringify(result).includes('FAKE_TEST'));assert.equal(f.posts.length,0);assert.deepEqual(transport.attempts,{});await transport.dispose();
});
