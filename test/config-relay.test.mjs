import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {botSettings,readSettings,saveSettings} from '../lib/bot-settings.mjs';import {BotGuildService} from '../desktop/bot-guild-service.mjs';import {queueTask} from '../lib/task-relay.mjs';
const targetThread='00000000-0000-4000-8000-000000000001';
const temporary=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'astro-public-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
test('fresh public configuration has no pre-authorized server or conversation',t=>{
 const data=temporary(t);assert.deepEqual(readSettings(data),{transport:'bot',guildId:'',channelId:'',targetThread:'',codexExecutable:''});
 assert.throws(()=>botSettings({transport:'chrome'}));assert.throws(()=>botSettings({targetThread:'bad'}));
 saveSettings(data,{targetThread,token:'SHOULD_NOT_PERSIST'});assert.ok(!fs.readFileSync(path.join(data,'transport.json'),'utf8').includes('SHOULD_NOT'));
});
test('missing target conversation blocks activation without touching token or Discord',async t=>{
 const data=temporary(t);const service=new BotGuildService({data,settings:botSettings({guildId:'1000000000000000001'}),config:{},vault:{has:()=>true,available:()=>true,read:()=>{throw new Error('must not decrypt');}},mailbox:false});
 try{await assert.rejects(service.mode('wake'),/Conversation Codex/);assert.equal(service.hub.rest,null);}finally{await service.dispose();}
});
test('queue sends only existing configured thread and portable guide; no second model session',async t=>{
 const data=temporary(t),exe=path.join(data,'codex.exe');fs.writeFileSync(exe,'fixture');let calls=0;
 await queueTask({targetThread,codexExecutable:exe},'ticket-test',{execute:(file,args,options,done)=>{
  calls++;assert.equal(file,exe);assert.deepEqual(args.slice(0,4),['queue','--thread',targetThread,'--message']);assert.ok(args[4].includes('TASK-BRIDGE.md'));assert.ok(args[4].includes('ticket-test'));assert.ok(!args.includes('exec'));assert.equal(options.windowsHide,true);done(null,`Queued message test ${targetThread}`);
 }});assert.equal(calls,1);
});
test('unknown queue acknowledgement rejects without resubmitting',async t=>{
 const data=temporary(t),exe=path.join(data,'codex.exe');fs.writeFileSync(exe,'fixture');let calls=0;
 await assert.rejects(queueTask({targetThread,codexExecutable:exe},'ticket',{execute:(_file,_args,_options,done)=>{calls++;done(null,'unrecognized');}}),/Accusé/);assert.equal(calls,1);
});
