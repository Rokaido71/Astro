import fs from 'node:fs';
import path from 'node:path';
import {Routes} from 'discord-api-types/v10';
import {BotService} from './bot-service.mjs';
import {BotTransport,BotError,safeBotError,channelPermissions} from '../lib/bot-transport.mjs';
import {threadId,guildRuntime,snowflake} from '../lib/bot-settings.mjs';
import {digest} from '../lib/core.mjs';
import {taskMailbox} from '../lib/task-mailbox.mjs';
class AccessChanged extends BotError {}

// One Gateway; separate immutable channel destinations and durable relays.
export class BotGuildService {
  constructor({data,settings,config,vault,publish=()=>{},transportFactory=o=>new BotTransport(o),dispatch,mailbox=true}){
    Object.assign(this,{data,settings,config,vault,publish,transportFactory,dispatch});
    this.modeValue='paused';this.epoch=0;this.accessEpoch=0;this.starting=false;this.children=new Map();this.allowed=new Map();this.firstEvent=new Map();this.work=Promise.resolve();this.runtime=guildRuntime(data,settings);
    fs.mkdirSync(this.runtime,{recursive:true});
    this.hub=transportFactory({settings,token:()=>vault.read(),onLost:()=>this.fail(new BotError('Connexion serveur interrompue : reprendre explicitement'))});
    this.hub.guildOnly=true;this.hub.onDispatch=e=>this.event(e);
    // Preserve existing channel states, including uncertain publications, without
    // reading Discord or copying any conversation into the coordinator view.
    const base=path.join(data,'bot-runtime');
    for(const name of fs.readdirSync(base)){
      const prefix=settings.guildId+'-';
      if(name.startsWith(prefix)&&snowflake(name.slice(prefix.length))&&fs.existsSync(path.join(base,name,'state.json')))this.child(name.slice(prefix.length));
    }
    this.closeMailbox=mailbox?taskMailbox(this,this.runtime):()=>{};
  }
  blockers(){return !snowflake(this.settings.guildId)?'Serveur Discord requis':!threadId(this.settings.targetThread)?'Conversation Codex existante requise':!this.vault.has()?'Configuration incomplète : jeton bot requis':!this.vault.available()?'Chiffrement système indisponible':null;}
  inspect(){return {transport:'bot',scope:'guild',guildId:this.settings.guildId,mode:this.modeValue,targetThread:this.settings.targetThread,error:this.error||null,channels:[...this.allowed.values()].map(c=>{const s=this.children.get(c.id)?.engine.inspect();return {...c,mode:s?.mode||this.modeValue,ticket:s?.ticket||null,outbox:s?.outbox?{id:s.outbox.id,status:s.outbox.status}:null,queued:s?.messages.length||0};})};}
  status(){
    const states=[...this.children.values()].map(c=>c.status()),visible=[...this.children].filter(([id])=>this.allowed.has(id)).map(([,c])=>c.status());
    return {transport:'bot',scope:'guild',mode:this.modeValue,starting:this.starting,busy:states.some(s=>s.busy),connected:this.hub.available,serviceReady:true,responseMode:'current-task',targetThread:this.settings.targetThread,botSettings:this.settings,botId:this.hub.botId,channelName:'serveur configuré · salons accessibles',channelCount:this.allowed.size,queued:states.reduce((n,s)=>n+s.queued,0),outbox:visible.find(s=>s.outbox)?.outbox||(states.some(s=>s.outbox)?{status:'uncertain',text:'Publication d’un salon actuellement inaccessible à réconcilier'}:null),error:this.error||this.blockers(),configurationBlocked:!!this.blockers(),tokenStored:this.vault.has(),encryptionAvailable:this.vault.available(),metrics:{wakeups:states.reduce((n,s)=>n+(s.metrics?.wakeups||0),0)}};
  }
  update(){this.publish(this.status());}
  fail(e){this.error=safeBotError(e);void this.mode('paused');}
  child(id){
    if(!snowflake(id))throw new BotError('Salon invalide');
    if(this.children.has(id))return this.children.get(id);
    const child=new BotService({data:this.data,settings:{...this.settings,channelId:id},config:this.config,vault:this.vault,mailbox:false,dispatch:this.dispatch,
      publish:()=>{const current=this.children.get(id);if(this.modeValue!=='paused'&&current?.engine.mode==='paused'&&current.engine.error)this.fail(new BotError('Un salon est en pause : vérifier son état avant reprise'));else this.update();},
      initializeSnapshot:(snapshot,engine)=>{
        const first=this.firstEvent.get(id);
        if(first){
          if(!snapshot.messages.some(m=>m.id===first))throw new BotError('Message déclencheur hors fenêtre : rattrapage ciblé requis');
          engine.s.baseline=true;for(const m of snapshot.messages)if(BigInt(m.id)<BigInt(first))engine.s.seen[m.id]=digest(m);
        }
      },
      transportFactory:options=>{
        const transport=this.transportFactory(options);
        const restFactory=transport.restFactory;transport.restFactory=()=>this.hub.rest||restFactory();
        // Child REST has its own cancellation controller. It never owns Gateway.
        transport.connect=async()=>{if(!this.hub.available||this.modeValue==='paused'||!this.allowed.has(id))throw new BotError('Serveur en pause ou salon inaccessible');await transport.authorize();transport.available=true;};
        return transport;
      }});
    // Recovery cannot restart one channel behind the global pause.
    child.engine.resumeWake=async()=>null;
    const send=child.engine.send;
    child.engine.send=intent=>{if(this.modeValue!=='wake'||!this.allowed.has(id)||!this.hub.available)return Promise.resolve({status:'notSent',error:'Serveur en pause ou salon inaccessible'});return send(intent);};
    this.children.set(id,child);return child;
  }
  enqueue(fn){const result=this.work.then(fn);this.work=result.catch(()=>{});return result;}
  async discover(){
    for(let attempt=0;attempt<3;attempt++){
      try{return await this.discoverOnce();}
      catch(e){if(!(e instanceof AccessChanged)||attempt===2)throw e;}
    }
  }
  async discoverOnce(){
    const epoch=this.epoch,accessEpoch=this.accessEpoch;
    if(this.blockers())throw new BotError(this.blockers());
    if(!this.hub.rest||!this.hub.controller||this.hub.controller.signal.aborted)await this.hub.authorize();
    const guildId=this.settings.guildId;
    const roles=await this.hub.get(Routes.guildRoles(guildId));
    const member=await this.hub.get(Routes.guildMember(guildId,this.hub.botId));
    const channels=await this.hub.get(Routes.guildChannels(guildId));
    if(epoch!==this.epoch)throw new BotError('Découverte annulée');
    if(accessEpoch!==this.accessEpoch)throw new AccessChanged('Permissions modifiées pendant découverte : réessayer explicitement');
    if(!Array.isArray(roles)||!Array.isArray(member.roles)||member.user?.id!==this.hub.botId||!Array.isArray(channels))throw new BotError('Permissions serveur illisibles');
    const next=new Map();
    for(const c of channels)if(c.type===0&&snowflake(c.id)&&(!c.guild_id||c.guild_id===guildId)&&channelPermissions(guildId,roles,member,c))next.set(c.id,{id:c.id,name:c.name,type:0,permissions:'68608'});
    this.allowed=next;
    for(const [id,child] of this.children)if(!next.has(id))await child.mode('paused');
    this.update();return [...next.values()];
  }
  async activateChild(id){
    const epoch=this.epoch,child=this.child(id);
    if(this.modeValue==='paused'||!this.allowed.has(id))return;
    if(child.engine.s.outbox){await this.mode('paused');throw new BotError('Publication à réconcilier avant reprise');}
    try{
      await child.mode(this.modeValue);
      if(epoch!==this.epoch||this.modeValue==='paused'||!this.allowed.has(id))await child.mode('paused');
      else this.firstEvent.delete(id);
    }catch(e){await child.mode('paused');if(epoch===this.epoch){this.error=safeBotError(e);this.update();}throw e;}
  }
  async mode(mode){
    if(mode==='paused'){
      this.modeValue='paused';this.epoch++;
      const stops=[this.hub.pause(),...[...this.children.values()].map(c=>c.mode('paused'))];this.update();await Promise.all(stops);return this.status();
    }
    if(!['observe','wake'].includes(mode)||this.starting)throw new BotError('Activation déjà en cours ou mode invalide');
    if(this.blockers())throw new BotError(this.blockers());
    if([...this.children.values()].some(c=>c.engine.busy||c.engine.s.outbox))throw new BotError('Publication ou traitement à réconcilier');
    this.starting=true;const epoch=this.epoch;this.update();
    try{
      if(!this.hub.available)await this.hub.connect();
      for(let attempt=0;attempt<3;attempt++){
        const accessEpoch=this.accessEpoch;
        try{
          await this.discover();if(epoch!==this.epoch)throw new BotError('Activation annulée');
          this.modeValue=mode;
          // Existing relays preserve their baseline; unseen channels are event-driven.
          for(const id of new Set([...this.children.keys(),...this.firstEvent.keys()]))if(this.allowed.has(id))await this.activateChild(id);
          if(accessEpoch!==this.accessEpoch)throw new AccessChanged('Permissions modifiées pendant activation');
          break;
        }catch(e){if(epoch!==this.epoch||accessEpoch===this.accessEpoch||attempt===2)throw e;}
      }
      if(epoch!==this.epoch)throw new BotError('Activation annulée');this.error=null;
    }catch(e){await this.mode('paused');this.error=safeBotError(e);throw new BotError(this.error);}
    finally{this.starting=false;this.update();}
    return this.status();
  }
  event(event){
    const d=event.d;if(!d||(d.guild_id!==this.settings.guildId&&!(['GUILD_CREATE','GUILD_DELETE'].includes(event.t)&&d.id===this.settings.guildId)))return;
    if(this.modeValue==='paused'&&!this.starting)return;
    const metadata=['CHANNEL_CREATE','CHANNEL_UPDATE','CHANNEL_DELETE','GUILD_ROLE_CREATE','GUILD_ROLE_UPDATE','GUILD_ROLE_DELETE','GUILD_MEMBER_UPDATE','GUILD_CREATE','GUILD_DELETE'];
    if(metadata.includes(event.t)){
      if(event.t==='GUILD_MEMBER_UPDATE'&&d.user?.id!==this.hub.botId)return;
      this.accessEpoch++;
      if(event.t==='GUILD_DELETE'){this.fail(new BotError('Serveur indisponible'));return;}
      const affected=event.t.startsWith('CHANNEL_')&&!(event.t==='CHANNEL_UPDATE'&&d.type!==0)?[d.id]:[...this.children.keys()];
      for(const id of affected){this.allowed.delete(id);void this.children.get(id)?.mode('paused');}
      // Startup owns discovery and activation. Its bounded version retry will
      // consume initial GUILD_CREATE without launching a competing activation.
      if(this.starting)return;
      const epoch=this.epoch;
      void this.enqueue(async()=>{if(epoch!==this.epoch)return;await this.discover();if(epoch!==this.epoch||this.modeValue==='paused')return;for(const id of affected)if(this.allowed.has(id)&&this.children.has(id))await this.activateChild(id);}).catch(e=>{this.error=safeBotError(e);this.update();});return;
    }
    if(!['MESSAGE_CREATE','MESSAGE_UPDATE','MESSAGE_DELETE','MESSAGE_DELETE_BULK'].includes(event.t)||!snowflake(d.channel_id))return;
    const id=d.channel_id;
    if(event.t==='MESSAGE_CREATE'&&(d.author?.bot||d.webhook_id)){this.children.get(id)?.transport.event(event);return;}
    if(event.t==='MESSAGE_CREATE'&&snowflake(d.id)&&!this.children.get(id)?.engine.s.baseline){const previous=this.firstEvent.get(id);if(!previous||BigInt(d.id)<BigInt(previous))this.firstEvent.set(id,d.id);}
    const epoch=this.epoch;
    void this.enqueue(async()=>{
      if(epoch!==this.epoch||this.modeValue==='paused')return;
      if(!this.allowed.has(id))await this.discover();
      if(epoch!==this.epoch||!this.allowed.has(id))return;
      if(!this.children.has(id)&&event.t!=='MESSAGE_CREATE')return;
      const child=this.child(id);
      if(child.engine.mode==='paused')await this.activateChild(id);else await child.sync();
    }).catch(e=>{this.error=safeBotError(e);this.update();});
  }
  find(field,id){
    const matches=[...this.children.values()].filter(c=>c.engine.s[field]?.id===id);
    if(matches.length!==1)throw new BotError('Ticket ou outbox introuvable ou ambigu');return matches[0];
  }
  async catchup(id){
    if(this.modeValue==='paused'||this.starting)throw new BotError('Activer Observer ou Cette conversation avant le rattrapage');
    if(!snowflake(id))throw new BotError('Salon cible requis');
    const epoch=this.epoch;await this.discover();if(!this.allowed.has(id))throw new BotError('Salon inaccessible');
    const child=this.child(id);
    if(child.engine.busy||child.engine.s.outbox||child.engine.s.wake)throw new BotError('Traitement du salon déjà en cours');
    if(child.engine.s.catchupCompleted)return {ok:true,channelId:id,added:0,mode:this.modeValue};
    const previouslySeen=new Set(child.engine.s.baseline?Object.keys(child.engine.s.seen):[]);
    if(child.engine.mode==='paused')await this.activateChild(id);
    const snapshot=await child.fresh();
    if(epoch!==this.epoch||this.modeValue==='paused')throw new BotError('Rattrapage annulé');
    const ledger=child.engine.s.catchupIds??=[];
    const cutoff=Date.now()-86400000;
    const selected=snapshot.messages.slice(-100).filter(m=>!m.self&&!m.ignored&&new RegExp(`<@!?${this.hub.botId}>`).test(m.text)&&Number((BigInt(m.id)>>22n)+1420070400000n)>=cutoff&&!previouslySeen.has(m.id)&&!ledger.includes(m.id)&&!child.engine.s.queue.some(q=>q.id===m.id));
    if(ledger.length+selected.length>1000)throw new BotError('Journal de rattrapage plein');
    for(const m of selected){child.engine.s.queue.push(m);ledger.push(m.id);child.engine.s.metrics.received++;}
    child.engine.s.catchupCompleted=true;child.engine.persist();if(this.modeValue==='wake'&&selected.length)child.engine.schedule();this.update();
    return {ok:true,channelId:id,added:selected.length,mode:this.modeValue};
  }
  async command(command){
    try{return await this.runCommand(command);}catch(e){throw new BotError(safeBotError(e));}
  }
  async runCommand(command){
    if(command.action==='pause'){await this.mode('paused');return {ok:true,mode:'paused'};}
    if(command.action==='channels')return {ok:true,channels:await this.discover()};
    if(command.action==='catchup')return this.enqueue(()=>this.catchup(command.channelId));
    if(command.action==='inspect'){
      if(!command.ticket||this.modeValue==='paused')return {ok:true,view:this.inspect()};
      const child=this.find('wake',command.ticket);if(!this.allowed.has(child.settings.channelId))throw new BotError('Salon inaccessible');
      return {ok:true,view:await child.engine.inspectFresh()};
    }
    if(command.action==='emojis'){
      await this.discover();const id=command.channelId||this.settings.channelId||this.allowed.keys().next().value;
      if(!this.allowed.has(id))throw new BotError('Salon inaccessible');return {ok:true,emojis:await this.child(id).engine.emojis()};
    }
    if(['recover','diagnose','recover-observed'].includes(command.action)){
      if(this.modeValue!=='paused')throw new BotError('Mettre tous les salons en pause');
      const child=this.find('outbox',command.outboxId);
      if(command.action==='recover-observed')return child.engine.recoverObserved(command);
      return command.action==='recover'?child.engine.recoverOutbox(command.outboxId):child.engine.reconcileOutbox(command.outboxId);
    }
    if(['reply','silent','handled'].includes(command.action)){
      if(this.modeValue!=='wake')throw new BotError('Serveur en pause');
      const child=this.find('wake',command.ticket);
      if(!this.allowed.has(child.settings.channelId))throw new BotError('Salon inaccessible');return child.engine.respond(command);
    }
    throw new BotError('Commande serveur inconnue');
  }
  async dispose(){await this.mode('paused');await this.work;this.closeMailbox();for(const child of this.children.values())await child.dispose();await this.hub.dispose();}
}
