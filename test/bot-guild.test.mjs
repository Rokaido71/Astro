import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';import {execFile} from 'node:child_process';
import {BotGuildService} from '../desktop/bot-guild-service.mjs';import {BotTransport} from '../lib/bot-transport.mjs';import {saveSettings,botRuntime} from '../lib/bot-settings.mjs';import {digest} from '../lib/core.mjs';
const guildId='1000000000000000001',a='1000000000000000002',b='1000000000000000010',hidden='1000000000000000011',bot='1000000000000000009',human='1000000000000000008';
const settings={transport:'bot',guildId,channelId:a,targetThread:'00000000-0000-4000-8000-000000000001'};
const sid=n=>String(((BigInt(Date.now()-1420070400000))<<22n)+BigInt(n));
function fixture(t,{mailbox=false,seed}={}){
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'astro-guild-test-'));saveSettings(data,settings);if(seed)seed(data);
 const f={data,calls:[],posts:[],dispatches:[],channels:[{id:a,guild_id:guildId,name:'general',type:0,permission_overwrites:[]},{id:b,guild_id:guildId,name:'nouveau',type:0,permission_overwrites:[]},{id:hidden,guild_id:guildId,name:'PRIVATE_NAME',type:0,permission_overwrites:[{id:guildId,type:0,deny:'1024',allow:'0'}]}],messages:new Map(),roles:[{id:guildId,permissions:'68608'}],member:{user:{id:bot},roles:[]},connections:0};
 f.message=(channel,id,text='Salut',author=human)=>({id,channel_id:channel,guild_id:guildId,content:text,type:0,author:{id:author,username:author===bot?'Astro':'Membre',bot:author===bot},attachments:[]});
 f.rest={setToken(){return this;},async get(route,options={}){
  f.calls.push(route);if(f.beforeGet)await f.beforeGet(route,options);
  if(route==='/users/@me')return {id:bot,bot:true};
  if(route===`/guilds/${guildId}/channels`)return f.channels;
  if(route===`/guilds/${guildId}/roles`)return f.roles;
  if(route===`/guilds/${guildId}/members/${bot}`)return f.member;
  if(route==='/applications/@me')return {id:bot};
  if(route===`/applications/${bot}/emojis`)return {items:[]};
  if(route===`/guilds/${guildId}/emojis`)return [];
  const match=route.match(/^\/channels\/(\d+)(?:\/messages(?:\/(\d+))?)?$/);
  if(match){const id=match[1];if(!f.channels.some(c=>c.id===id))throw new Error('404');if(!route.includes('/messages'))return f.channels.find(c=>c.id===id);
   const messages=f.messages.get(id)||[];if(match[2]){const found=messages.find(m=>m.id===match[2]);if(!found)throw new Error('404');return found;}
   const before=options.query?.get('before');return messages.filter(m=>!before||BigInt(m.id)<BigInt(before)).slice(-100).reverse();
  }throw new Error('Unexpected route '+route);
 },async post(route,options){f.posts.push({route,...options});const id=route.split('/')[2],m={...f.message(id,sid(500+f.posts.length),options.body.content,bot),nonce:options.body.nonce};f.messages.set(id,[...(f.messages.get(id)||[]),m]);return m;}};
 f.gateway=new EventEmitter();f.gateway.connect=async()=>{f.connections++;};f.gateway.destroy=async()=>{};
 f.s=new BotGuildService({data,settings,config:{debounceMs:999999,maxWaitMs:999999},vault:{has:()=>true,available:()=>true,read:()=> 'FAKE_TOKEN_TEST'},mailbox,dispatch:async id=>f.dispatches.push(id),transportFactory:options=>new BotTransport({...options,restFactory:()=>f.rest,gatewayFactory:()=>f.gateway})});
 f.emit=(type,d)=>f.s.hub.event({t:type,d});f.create=async(channel,id,text='Salut')=>{const m=f.message(channel,id,text);f.messages.set(channel,[...(f.messages.get(channel)||[]),m]);f.emit('MESSAGE_CREATE',m);await f.s.work;return m;};
 t.after(async()=>{await f.s.dispose();fs.rmSync(data,{recursive:true,force:true});});return f;
}
test('one Gateway discovers only permitted metadata without historical message reads',async t=>{
 const f=fixture(t);await f.s.mode('wake');assert.equal(f.connections,1);assert.equal(f.s.children.size,0);assert.ok(f.calls.every(p=>!p.includes('/messages')));
 const list=await f.s.command({action:'channels'});assert.deepEqual(list.channels.map(c=>c.id),[a,b]);assert.ok(!JSON.stringify(f.s.inspect()).includes('PRIVATE_NAME'));assert.equal(f.s.status().starting,false);
});

test('initial GUILD_CREATE during discovery refreshes metadata without cancelling activation',async t=>{
 const f=fixture(t);let injected=false;
 f.beforeGet=async route=>{if(route===`/guilds/${guildId}/channels`&&!injected){injected=true;f.emit('GUILD_CREATE',{id:guildId});}};
 const result=await f.s.mode('observe');await f.s.work;
 assert.equal(result.mode,'observe');assert.equal(result.starting,false);assert.equal(f.s.error,null);assert.equal(f.s.allowed.size,2);assert.equal(f.posts.length,0);
});

test('channels during startup shares valid discovery and cannot cancel startup',async t=>{
 const f=fixture(t);let release,started;const reached=new Promise(r=>started=r);let held=false;
 f.beforeGet=async route=>{if(route===`/guilds/${guildId}/channels`&&!held){held=true;started();await new Promise(r=>release=r);}};
 const starting=f.s.mode('observe');await reached;const list=await f.s.command({action:'channels'});release();const result=await starting;
 assert.equal(list.channels.length,2);assert.equal(result.mode,'observe');assert.equal(f.s.status().starting,false);
});

test('late initial guild event with persisted general wake state preserves pending work',async t=>{
 const f=fixture(t,{seed:data=>{const dir=botRuntime(data,settings);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({botId:bot,baseline:true,cursor:null,seen:{},queue:[],context:[],wake:{id:'old-ticket',status:'queued'}}));}});
 f.messages.set(a,[f.message(a,sid(35),'Pending')]);let injected=false;
 f.beforeGet=async route=>{if(route===`/channels/${a}/messages`&&!injected){injected=true;f.emit('GUILD_CREATE',{id:guildId});}};
 const result=await f.s.mode('observe');await f.s.work;
 assert.equal(result.mode,'observe');assert.equal(f.s.children.get(a).engine.mode,'observe');assert.equal(f.s.children.get(a).engine.s.queue.length,1);assert.equal(f.s.children.get(a).engine.s.wake,null);assert.ok(f.s.allowed.has(a));assert.equal(f.posts.length,0);
});

test('continuous metadata changes fail bounded and never activate stale permissions',async t=>{
 const f=fixture(t);let reads=0;f.beforeGet=async route=>{if(route===`/guilds/${guildId}/channels`){reads++;f.emit('GUILD_CREATE',{id:guildId});}};
 await assert.rejects(f.s.mode('observe'));assert.ok(reads<=9);assert.equal(f.s.modeValue,'paused');assert.equal(f.s.hub.available,false);assert.equal(f.posts.length,0);
});
test('first new-channel event queues trigger, isolates tickets and posts to origin',async t=>{
 const f=fixture(t);await f.s.mode('wake');const old=sid(1);f.messages.set(b,[f.message(b,old,'Old history')]);
 const trigger=await f.create(b,sid(2));await f.create(a,sid(3));
 const ca=f.s.children.get(a),cb=f.s.children.get(b);assert.deepEqual(cb.engine.s.queue.map(m=>m.id),[trigger.id]);assert.equal(ca.engine.s.queue.length,1);
 await ca.engine.flush();await cb.engine.flush();assert.notEqual(ca.engine.s.wake.id,cb.engine.s.wake.id);
 const view=(await f.s.command({action:'inspect',ticket:cb.engine.s.wake.id})).view;assert.equal(view.channelId,b);assert.equal(view.messages.length,1);
 await f.s.command({action:'reply',ticket:view.ticket.id,expected:view.expected,text:'Réponse salon B'});
 assert.equal(f.posts.length,1);assert.equal(f.posts[0].route,`/channels/${b}/messages`);assert.equal(cb.engine.s.queue.length,0);assert.equal(ca.engine.s.queue.length,1);assert.equal(f.connections,1);
 assert.ok(fs.existsSync(path.join(botRuntime(f.data,{...settings,channelId:b}),'publications.json')));
});
test('new channel creation and foreign or denied message events never leak content',async t=>{
 const f=fixture(t);await f.s.mode('observe');const c='1000000000000000012';f.channels.push({id:c,guild_id:guildId,name:'newest',type:0,permission_overwrites:[]});
 f.emit('CHANNEL_CREATE',f.channels.at(-1));await f.s.work;assert.ok(f.s.allowed.has(c));await f.create(c,sid(4));assert.equal(f.s.children.get(c).engine.s.queue.length,1);
 f.emit('MESSAGE_CREATE',{...f.message(hidden,sid(5),'SECRET'),guild_id:'1000000000000000005'});await f.create(hidden,sid(6),'SECRET');
 assert.ok(!f.s.children.has(hidden));assert.ok(f.calls.every(p=>!p.startsWith(`/channels/${hidden}`)));assert.ok(!JSON.stringify(f.s.inspect()).includes('SECRET'));
});
test('permissions revoked and channel deleted stop child, preserve pending, block responses',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(b,sid(7));const child=f.s.children.get(b);await child.engine.flush();const ticket=child.engine.s.wake.id;
 f.channels.find(c=>c.id===b).permission_overwrites=[{id:bot,type:1,deny:'2048',allow:'0'}];const before=f.calls.filter(p=>p.endsWith('/messages')).length;
 f.emit('CHANNEL_UPDATE',f.channels.find(c=>c.id===b));assert.equal(child.engine.mode,'paused');await f.s.work;
 assert.ok(!f.s.allowed.has(b));assert.equal(child.engine.s.queue.length,1);assert.equal(f.calls.filter(p=>p.endsWith('/messages')).length,before);await assert.rejects(f.s.command({action:'reply',ticket,text:'No'}));
 f.channels=f.channels.filter(c=>c.id!==b);f.emit('CHANNEL_DELETE',{id:b,guild_id:guildId});await f.s.work;assert.equal(child.engine.s.queue.length,1);assert.equal(f.posts.length,0);
});
test('bot membership change invalidates roles and rechecks access before reads',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(a,sid(8));f.roles=[{id:guildId,permissions:'0'}];
 f.emit('GUILD_MEMBER_UPDATE',{guild_id:guildId,user:{id:bot},roles:[]});assert.equal(f.s.children.get(a).engine.mode,'paused');await f.s.work;assert.equal(f.s.allowed.size,0);assert.equal(f.posts.length,0);
});
test('global pause cancels discovery and child cannot reconnect itself',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(a,sid(9));let release,started;const reached=new Promise(r=>started=r);
 f.beforeGet=async route=>{if(route===`/guilds/${guildId}/channels`){started();await new Promise(r=>release=r);}};
 const pending=f.s.command({action:'channels'});await reached;await f.s.mode('paused');release();await assert.rejects(pending);
 assert.equal(f.s.status().mode,'paused');await assert.rejects(f.s.children.get(a).mode('wake'));assert.equal(f.posts.length,0);
});
test('catchup only target recent mentions, idempotent with no scan of other channels',async t=>{
 const f=fixture(t);const old=String((BigInt(Date.now()-1420070400000-2*86400000))<<22n);
 f.messages.set(b,[f.message(b,old,`<@${bot}> old`),f.message(b,sid(10),'ordinary'),f.message(b,sid(11),`<@${bot}> missed`)]);
 await f.s.mode('wake');const result=await f.s.command({action:'catchup',channelId:b});assert.equal(result.added,1);assert.equal(f.s.children.get(b).engine.s.queue.length,1);
 assert.equal((await f.s.command({action:'catchup',channelId:b})).added,0);assert.ok(f.calls.filter(p=>p.includes('/messages')).every(p=>p.startsWith(`/channels/${b}`)));await assert.rejects(f.s.command({action:'catchup',channelId:hidden}));
});
test('legacy general baseline survives coordinator migration',async t=>{
 const id=sid(12),f=fixture(t,{seed:data=>{const dir=botRuntime(data,settings);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({botId:bot,baseline:true,cursor:null,seen:{},queue:[],context:[]}));}});
 await f.s.mode('observe');await f.create(a,id);assert.equal(f.s.children.get(a).engine.s.queue[0].id,id);assert.equal(f.connections,1);
});
test('CLI channels and ticket inspect use global mailbox',async t=>{
 const f=fixture(t,{mailbox:true});await f.s.mode('wake');await f.create(b,sid(13));const child=f.s.children.get(b);await child.engine.flush();
 const cli=async args=>new Promise((resolve,reject)=>execFile(process.execPath,[path.resolve('scripts/task-control.mjs'),...args],{env:{...process.env,ASTRO_DATA_DIR:f.data},windowsHide:true,timeout:10000},(e,out)=>e?reject(e):resolve(JSON.parse(out))));
 const channels=await cli(['channels']);assert.ok(!JSON.stringify(channels).includes('PRIVATE_NAME'));const view=await cli(['inspect',child.engine.s.wake.id]);assert.equal(view.channelId,b);assert.equal(view.messages.length,1);
 await cli(['pause']);assert.equal(f.s.modeValue,'paused');assert.equal(child.engine.mode,'paused');
});

test('pause during a channel send preflight prevents POST across all relays',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(a,sid(20));await f.create(b,sid(21));const child=f.s.children.get(b);await child.engine.flush();
 const view=(await f.s.command({action:'inspect',ticket:child.engine.s.wake.id})).view;
 let release,started;const reached=new Promise(r=>started=r);f.beforeGet=async route=>{if(route===`/channels/${b}/messages`){started();await new Promise(r=>release=r);}};
 const responding=f.s.command({action:'reply',ticket:view.ticket.id,expected:view.expected,text:'Cancelled'});
 await reached;await f.s.mode('paused');release();await assert.rejects(responding);
 assert.equal(f.posts.length,0);for(const c of f.s.children.values())assert.equal(c.engine.mode,'paused');
});
test('owner recovery routes exact channel and never bypasses global pause',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(a,sid(22));await f.create(b,sid(23));await f.s.mode('paused');
 const child=f.s.children.get(b),messageId=sid(24),text='Original';f.messages.get(b).push(f.message(b,messageId,'Observed',bot));
 child.engine.s.outbox={id:'channel-b-outbox',text,status:'uncertain',requestIds:[child.engine.s.queue[0].id]};child.transport.attempts['channel-b-outbox']={nonce:'nonce',textHash:digest(text),status:'attempted'};
 const result=await f.s.command({action:'recover-observed',outboxId:'channel-b-outbox',messageId,observedText:'Observed',acceptObserved:true});
 assert.equal(result.mode,'paused');assert.equal(child.engine.s.outbox,null);assert.equal(f.s.children.get(a).engine.s.queue.length,1);assert.equal(f.s.modeValue,'paused');assert.equal(f.posts.length,0);
 assert.ok(f.calls.includes(`/channels/${b}/messages/${messageId}`));
});
test('startup event is not swallowed as baseline and events while paused do nothing',async t=>{
 const f=fixture(t);let release,started;const reached=new Promise(r=>started=r);
 f.beforeGet=async route=>{if(route===`/guilds/${guildId}/channels`){started();await new Promise(r=>release=r);}};
 const activating=f.s.mode('wake');await reached;const m=f.message(b,sid(25));f.messages.set(b,[m]);f.emit('MESSAGE_CREATE',m);release();await activating;await f.s.work;
 assert.equal(f.s.children.get(b).engine.s.queue[0].id,m.id);
 await f.s.mode('paused');const before=f.calls.length;await f.create(a,sid(26));assert.equal(f.calls.length,before);assert.ok(!f.s.children.has(a));
});
test('permissions revoked during message read discard late snapshot without queue mutation',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(b,sid(27));const child=f.s.children.get(b);const count=child.engine.s.queue.length;
 let release,started;const reached=new Promise(r=>started=r);f.beforeGet=async route=>{if(route===`/channels/${b}/messages`){started();await new Promise(r=>release=r);}};
 const second=f.create(b,sid(28));await reached;f.channels.find(c=>c.id===b).permission_overwrites=[{id:guildId,type:0,deny:'1024',allow:'0'}];f.emit('CHANNEL_UPDATE',f.channels.find(c=>c.id===b));release();await second;await f.s.work;
 assert.equal(child.engine.mode,'paused');assert.equal(child.engine.s.queue.length,count);assert.equal(f.posts.length,0);assert.ok(!f.s.allowed.has(b));
});

test('server loss pauses every channel and catalogue errors are sanitized',async t=>{
 const f=fixture(t);await f.s.mode('wake');await f.create(a,sid(29));f.emit('GUILD_DELETE',{id:guildId,unavailable:true});
 assert.equal(f.s.modeValue,'paused');assert.equal(f.s.children.get(a).engine.mode,'paused');
 f.beforeGet=async()=>{throw new Error('FAKE_SECRET_IN_SDK_ERROR');};
 await assert.rejects(f.s.command({action:'channels'}),e=>!e.message.includes('FAKE_SECRET'));assert.equal(f.posts.length,0);
});

test('catchup ledger survives restart and processed mentions are not replayed',async t=>{
 const f=fixture(t);f.messages.set(b,[f.message(b,sid(30),`<@${bot}> missed`)]);await f.s.mode('wake');await f.s.command({action:'catchup',channelId:b});
 const child=f.s.children.get(b);await child.engine.flush();const view=(await f.s.command({action:'inspect',ticket:child.engine.s.wake.id})).view;
 await f.s.command({action:'silent',ticket:view.ticket.id,expected:view.expected});assert.equal(child.engine.s.queue.length,0);await f.s.dispose();
 f.s=new BotGuildService({data:f.data,settings,config:{debounceMs:999999,maxWaitMs:999999},vault:{has:()=>true,available:()=>true,read:()=> 'FAKE_TOKEN_TEST'},mailbox:false,dispatch:async()=>{},transportFactory:options=>new BotTransport({...options,restFactory:()=>f.rest,gatewayFactory:()=>f.gateway})});
 await f.s.mode('wake');assert.equal((await f.s.command({action:'catchup',channelId:b})).added,0);assert.equal(f.s.children.get(b).engine.s.queue.length,0);assert.equal(f.posts.length,0);
});
