import fs from 'node:fs';
import path from 'node:path';
import {TaskRelay} from '../lib/task-relay.mjs';
import {validateSnapshot} from '../lib/core.mjs';
import {BotTransport,BotError,safeBotError} from '../lib/bot-transport.mjs';
import {threadId,botRuntime,writeJSON} from '../lib/bot-settings.mjs';
import {taskMailbox} from '../lib/task-mailbox.mjs';

class BotRelay extends TaskRelay {
  async emojis(){
    try{
      const snapshot=await this.refresh();validateSnapshot(snapshot,this.c,this.now());
      return await this.botTransport.emojis();
    }catch(e){throw new BotError(safeBotError(e));}
  }
  async recoverObserved(command){
    if(this.mode!=='paused'||this.busy||command.acceptObserved!==true)throw new BotError('Acceptation propriétaire explicite en pause requise');
    const outbox=this.s.outbox;
    if(!outbox||outbox.id!==command.outboxId||outbox.status!=='uncertain')throw new BotError('Outbox incertaine exacte requise');
    this.busy=true;
    try{
      const snapshot=await this.refresh();validateSnapshot(snapshot,this.c,this.now());
      const proof=await this.botTransport.verifyObserved(outbox,command);
      if(this.mode!=='paused'||this.s.outbox!==outbox)throw new BotError('Récupération annulée');
      const attempt=this.botTransport.attempts[outbox.id];
      Object.assign(attempt,{messageId:proof.messageId,status:'owner-accepted',observedTextHash:proof.observedTextHash,noncePresent:proof.noncePresent,acceptedAt:this.now()});
      this.botTransport.saveAttempts(this.botTransport.attempts);
      this.s.lastObservedAcceptance={outboxId:outbox.id,...proof,at:this.now()};
      this.resolve({id:outbox.id,messageId:proof.messageId});
      this.s.lastSent={id:proof.messageId,text:command.observedText};this.persist();
      return {status:'owner-accepted',messageId:proof.messageId,mode:this.mode,resumed:false,queueCount:this.s.queue.length};
    }catch(e){throw new BotError(safeBotError(e));}
    finally{this.busy=false;this.emit({type:'status',...this.status()});}
  }
  setMode(mode){super.setMode(mode);if(mode==='paused')this.onPause?.();}
  async reconcileOutbox(id){
    if(this.mode!=='paused'||this.busy)throw new BotError('Mettre le bot en pause avant la réconciliation');
    const outbox=this.s.outbox;if(!outbox||outbox.id!==id)throw new BotError('Outbox introuvable');
    const snapshot=await this.refresh();validateSnapshot(snapshot,this.c,this.now());
    let proof;try{proof=await this.botTransport.reconcile(outbox);}catch(e){throw new BotError(safeBotError(e));}
    if(proof.status==='published')return {...proof,outboxId:id,draftPresent:false};
    const attempted=this.botTransport.attempts[id];
    if(!attempted&&outbox.status==='notSent')return {status:'notSent',outboxId:id,draftPresent:false};
    return {status:'ambiguous',outboxId:id,draftPresent:false};
  }
}

export class BotService {
  constructor({data,settings,config,vault,publish=()=>{},transportFactory=options=>new BotTransport(options),dispatch,mailbox=true,initializeSnapshot=()=>{}}){
    this.initializeSnapshot=initializeSnapshot;
    Object.assign(this,{data,settings,vault,publish});this.epoch=0;this.starting=false;this.readChain=Promise.resolve();
    this.runtime=botRuntime(data,settings);fs.mkdirSync(this.runtime,{recursive:true});
    const stateFile=path.join(this.runtime,'state.json'),attemptsFile=path.join(this.runtime,'publications.json');
    const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
    const state=read(stateFile);
    this.transport=transportFactory({settings,token:()=>vault.read(),attempts:read(attemptsFile),saveAttempts:attempts=>writeJSON(attemptsFile,attempts),onChange:()=>this.scheduleSync(),onLost:()=>{
      if(this.engine.mode!=='paused'||this.starting)this.engine.fail(new BotError('Connexion Discord interrompue : reprendre pour resynchroniser'));
    }});
    this.engine=new BotRelay({config:{...config,transport:'bot',group:settings.channelId,guildId:settings.guildId,channelId:settings.channelId,account:state.botId||'',responseMode:'current-task',targetThread:this.settings.targetThread},state,save:s=>writeJSON(stateFile,s),dispatch,
      emit:()=>this.update(),refresh:()=>this.fresh(),activate:m=>this.mode(m.mode),
      send:intent=>this.transport.send(intent,{allowed:()=>this.engine.mode==='wake'&&intent.epoch===this.engine.epoch,anchors:this.anchors()})});
    this.engine.botTransport=this.transport;
    this.engine.onPause=()=>{this.epoch++;clearTimeout(this.timer);this.stopping=this.transport.pause();this.stopping.catch(()=>{});};
    this.closeMailbox=mailbox?taskMailbox(this.engine,this.runtime):()=>{};
  }
  anchors(){return [...this.engine.s.context,...this.engine.s.queue].map(m=>m.id);}
  blockers(){return !threadId(this.settings.targetThread)?'Conversation Codex existante requise':!this.transport.configured()?'Configuration incomplète : serveur et salon requis':!this.vault.has()?'Configuration incomplète : jeton bot à saisir localement':!this.vault.available()?'Chiffrement système indisponible':null;}
  status(){return {...this.engine.status(),transport:'bot',responseMode:'current-task',targetThread:this.settings.targetThread,connected:this.transport.available,serviceReady:true,botId:this.transport.botId,channelName:this.transport.channelName||null,botSettings:this.settings,tokenStored:this.vault.has(),encryptionAvailable:this.vault.available(),configurationBlocked:!!this.blockers(),starting:this.starting,error:this.engine.error||this.blockers()};}
  update(){this.publish(this.status());}
  bind(){
    const id=this.transport.botId;
    if(this.engine.s.botId&&this.engine.s.botId!==id)throw new BotError('Ce salon possède un état associé à un autre bot : réconciliation propriétaire requise');
    this.engine.s.botId=id;this.engine.c.account=id;this.engine.persist();
  }
  async fresh(){
    const generation=this.epoch;
    const read=async()=>{
      try{
        if(generation!==this.epoch)throw new BotError('Lecture annulée');
        if(!this.transport.rest){await this.transport.authorize();if(generation!==this.epoch)throw new BotError('Lecture annulée');this.bind();}
        const snapshot=await this.transport.snapshot({anchors:this.anchors()});
        if(generation!==this.epoch)throw new BotError('Lecture annulée');return snapshot;
      }catch(e){throw new BotError(safeBotError(e));}
    };
    const result=this.readChain.then(read);this.readChain=result.catch(()=>{});return result;
  }
  async mode(mode){
    if(mode==='paused'){this.engine.setMode('paused');await this.stopping;this.update();return this.status();}
    if(!['wake','observe'].includes(mode))throw new BotError('Le bot utilise Observer ou Cette conversation');
    if(this.starting||this.engine.busy||this.engine.s.outbox)throw new BotError('Une opération ou publication attend sa réconciliation');
    if(this.blockers())throw new BotError(this.blockers());
    this.starting=true;const generation=this.epoch;this.update();
    try{
      await this.stopping;
      if(!this.transport.available)await this.transport.connect();
      if(generation!==this.epoch)throw new BotError('Activation annulée');
      this.bind();const snapshot=await this.fresh();
      if(generation!==this.epoch||!this.transport.available)throw new BotError('Activation annulée');
      validateSnapshot(snapshot,this.engine.c);
      if(!this.engine.s.baseline)this.initializeSnapshot(snapshot,this.engine);
      this.engine.setMode(mode);this.engine.ingest(snapshot);this.engine.error=null;
    }catch(e){if(generation===this.epoch)this.engine.fail(new BotError(safeBotError(e)));throw new BotError(safeBotError(e));}
    finally{this.starting=false;this.update();}
    return this.status();
  }
  scheduleSync(){
    if(this.engine.mode==='paused'||this.starting)return;
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),150);this.timer.unref?.();
  }
  async sync(){
    if(this.engine.mode==='paused')return;
    if(this.syncing){this.dirty=true;return;}
    this.syncing=true;const generation=this.epoch;
    try{const snapshot=await this.fresh();if(generation===this.epoch&&this.engine.mode!=='paused')this.engine.ingest(snapshot);}
    catch(e){if(generation===this.epoch)this.engine.fail(new BotError(safeBotError(e)));}
    finally{this.syncing=false;this.update();if(this.dirty){this.dirty=false;this.scheduleSync();}}
  }
  async dispose(){await this.mode('paused');clearTimeout(this.timer);this.closeMailbox();await this.transport.dispose();}
}
