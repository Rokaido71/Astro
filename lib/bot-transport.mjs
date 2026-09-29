import {createHash} from 'node:crypto';
import {REST} from '@discordjs/rest';
import {WebSocketManager,WebSocketShardEvents} from '@discordjs/ws';
import {Routes,GatewayIntentBits,PermissionFlagsBits} from 'discord-api-types/v10';
import {digest} from './core.mjs';
import {snowflake} from './bot-settings.mjs';

export class BotError extends Error {}
export const safeBotError=e=>e instanceof BotError?e.message:'Discord indisponible ou autorisation refusée. Vérifiez le jeton, les intents et les permissions.';
export const nonceFor=id=>createHash('sha256').update(id).digest('hex').slice(0,24);
const required=PermissionFlagsBits.ViewChannel|PermissionFlagsBits.ReadMessageHistory|PermissionFlagsBits.SendMessages;
export function channelPermissions(guildId,roles,member,channel){
  let bits=0n;const ids=new Set([guildId,...member.roles]);
  for(const role of roles)if(ids.has(role.id))bits|=BigInt(role.permissions);
  if(bits&PermissionFlagsBits.Administrator)return true;
  const overwrites=channel.permission_overwrites||[],apply=o=>{if(o)bits=(bits&~BigInt(o.deny))|BigInt(o.allow);};
  apply(overwrites.find(o=>o.id===guildId&&o.type===0));
  let deny=0n,allow=0n;
  for(const o of overwrites)if(o.type===0&&o.id!==guildId&&ids.has(o.id)){deny|=BigInt(o.deny);allow|=BigInt(o.allow);}
  bits=(bits&~deny)|allow;apply(overwrites.find(o=>o.id===member.user.id&&o.type===1));
  return (bits&required)===required;
}

export class BotTransport {
  constructor({settings,token,attempts={},saveAttempts=()=>{},onChange=()=>{},onLost=()=>{},restFactory=()=>new REST({version:'10',retries:0,timeout:10000,rejectOnRateLimit:()=>true}),gatewayFactory=options=>new WebSocketManager(options),now=Date.now}){
    Object.assign(this,{settings,token,attempts,saveAttempts,onChange,onLost,restFactory,gatewayFactory,now});
    this.generation=0;this.available=false;this.botId=null;this.manager=null;this.rest=null;this.controller=null;
  }
  configured(){return snowflake(this.settings.guildId)&&(this.guildOnly||snowflake(this.settings.channelId));}
  async authorize(){
    const generation=this.generation;
    if(!this.configured())throw new BotError('Configuration incomplète : renseignez le serveur et le salon');
    if(!this.rest){
      let token;try{token=await this.token();}catch{throw new BotError('Jeton chiffré absent ou illisible : utilisez les réglages locaux');}
      if(generation!==this.generation)throw new BotError('Connexion annulée');
      if(!token)throw new BotError('Jeton absent');
      this.rest=this.restFactory().setToken(token);this.tokenValue=token;
    }
    if(!this.controller||this.controller.signal.aborted)this.controller=new AbortController();
    const identity=await this.get(Routes.user());
    if(!identity.bot||!snowflake(identity.id))throw new BotError('Un compte bot officiel est requis');
    if(this.botId&&identity.id!==this.botId)throw new BotError('Identité bot modifiée');
    this.botId=identity.id;
    if(!this.guildOnly)await this.checkTarget();return this.botId;
  }
  async get(route,options={},generation=this.generation){
    const controller=this.controller;
    if(generation!==this.generation||controller?.signal.aborted)throw new BotError('Lecture annulée');
    const result=await this.rest.get(route,{...options,signal:controller.signal});
    if(generation!==this.generation||controller.signal.aborted)throw new BotError('Lecture annulée');return result;
  }
  async checkTarget(){
    const {guildId,channelId}=this.settings;
    const channel=await this.get(Routes.channel(channelId));
    if(channel.id!==channelId||channel.guild_id!==guildId||channel.type!==0)throw new BotError('Le salon autorisé doit être un salon texte du serveur configuré');
    const roles=await this.get(Routes.guildRoles(guildId));
    const member=await this.get(Routes.guildMember(guildId,this.botId));
    if(member.user?.id!==this.botId||!Array.isArray(member.roles)||!Array.isArray(roles)||!channelPermissions(guildId,roles,member,channel))throw new BotError('Permissions requises : Voir le salon, Historique, Envoyer des messages');
    this.channelName=channel.name;this.memberRoles=new Set([guildId,...member.roles]);return channel;
  }
  async emojis(){
    await this.checkTarget();
    const app=await this.get(Routes.currentApplication());
    if(!snowflake(app.id)||(app.bot&&app.bot.id!==this.botId))throw new BotError('Application bot non conforme');
    const application=await this.get(Routes.applicationEmojis(app.id));
    const guild=await this.get(Routes.guildEmojis(this.settings.guildId));
    if(!Array.isArray(application.items)||!Array.isArray(guild))throw new BotError('Catalogue emoji illisible');
    const compact=(items,isGuild)=>items.filter(e=>snowflake(e.id)&&typeof e.name==='string'&&/^[A-Za-z0-9_]{2,32}$/.test(e.name)&&e.available!==false&&(!isGuild||(!e.roles?.length||e.roles.some(id=>this.memberRoles.has(id))))).map(e=>({id:e.id,name:e.name,animated:e.animated===true}));
    return {application:compact(application.items,false),guild:compact(guild,true)};
  }
  async connect(){
    const generation=++this.generation;
    await this.authorize();
    if(generation!==this.generation)throw new BotError('Connexion annulée');
    const manager=this.gatewayFactory({token:this.tokenValue,rest:this.rest,intents:GatewayIntentBits.Guilds|GatewayIntentBits.GuildMessages|GatewayIntentBits.MessageContent});
    this.manager=manager;
    manager.on(WebSocketShardEvents.Dispatch,event=>{if(generation===this.generation)this.event(event);});
    const lost=()=>{if(generation===this.generation){this.available=false;this.controller?.abort();this.onLost();}};
    manager.on(WebSocketShardEvents.Closed,lost);manager.on(WebSocketShardEvents.Error,lost);manager.on(WebSocketShardEvents.SocketError,lost);
    let timer;
    try{await Promise.race([manager.connect(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new BotError('Connexion Discord expirée')),20000);})]);}
    finally{clearTimeout(timer);}
    if(generation!==this.generation)throw new BotError('Connexion annulée');
    this.available=true;
  }
  event(event){
    const d=event.d;
    if(this.guildOnly){if(d&&(d.guild_id===this.settings.guildId||(['GUILD_CREATE','GUILD_DELETE'].includes(event.t)&&d.id===this.settings.guildId)))this.onDispatch?.(event);return;}
    if(d?.guild_id===this.settings.guildId&&(['GUILD_ROLE_CREATE','GUILD_ROLE_UPDATE','GUILD_ROLE_DELETE'].includes(event.t)||(event.t==='CHANNEL_UPDATE'&&d.id===this.settings.channelId))){this.onChange();return;}
    // No caching, fetching, logging or forwarding other guild/channel events.
    if(!d||d.guild_id!==this.settings.guildId||d.channel_id!==this.settings.channelId)return;
    if(event.t==='MESSAGE_CREATE'&&d.author?.id===this.botId&&d.nonce!=null){
      const attempt=Object.values(this.attempts).find(a=>a.nonce===String(d.nonce));
      if(attempt&&snowflake(d.id)&&digest(d.content)===attempt.textHash){attempt.messageId=d.id;this.saveAttempts(this.attempts);}
    }
    if(['MESSAGE_CREATE','MESSAGE_UPDATE','MESSAGE_DELETE','MESSAGE_DELETE_BULK'].includes(event.t)){
      // Other bots and self never trigger Codex; deletions/edits still refresh
      // the complete interval to keep cursors and queued human requests sound.
      if(event.t==='MESSAGE_CREATE'&&(d.author?.bot||d.webhook_id))return;
      this.onChange();
    }
  }
  async pause(){
    this.generation++;this.available=false;this.controller?.abort();
    const manager=this.manager;this.manager=null;
    if(manager)try{await manager.destroy();}catch{}
  }
  async dispose(){await this.pause();this.rest=null;this.tokenValue=null;}
  message(raw){
    const {channelId,guildId}=this.settings;
    if(raw.channel_id!==channelId||(raw.guild_id&&raw.guild_id!==guildId)||!snowflake(raw.id)||!snowflake(raw.author?.id)||typeof raw.content!=='string')throw new BotError('Message Discord hors périmètre ou incomplet');
    return {id:raw.id,author:raw.author.username||raw.author.id,authorId:raw.author.id,self:raw.author.id===this.botId,ignored:!!(raw.author.bot||raw.webhook_id||![0,19].includes(raw.type)),text:raw.content,attachments:(raw.attachments||[]).map(a=>({name:a.filename||'',url:a.url})),reply:raw.message_reference?.channel_id===channelId?raw.message_reference.message_id||'':'',nonce:raw.nonce==null?null:String(raw.nonce)};
  }
  async snapshot({anchors=[]}={}){
    if(!this.rest||!this.botId)throw new BotError('Bot non connecté');
    const generation=this.generation,observedAt=this.now();
    if(!this.controller||this.controller.signal.aborted)this.controller=new AbortController();
    await this.checkTarget();
    const messages=[];let before,completeHistory=false;
    for(let page=0;page<5;page++){
      const query=new URLSearchParams({limit:'100',...(before?{before}:{})});
      const raw=await this.get(Routes.channelMessages(this.settings.channelId),{query},generation);
      if(!Array.isArray(raw))throw new BotError('Historique Discord illisible');
      const batch=raw.map(m=>this.message(m));messages.push(...batch);
      if(raw.length<100){completeHistory=true;break;}
      const oldestAnchor=anchors.length?anchors.reduce((a,b)=>BigInt(a)<BigInt(b)?a:b):null;
      if(!oldestAnchor||batch.some(m=>BigInt(m.id)<=BigInt(oldestAnchor)))break;
      before=batch.at(-1)?.id;
    }
    if(generation!==this.generation)throw new BotError('Lecture annulée');
    messages.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
    if(!completeHistory&&anchors.some(id=>!messages.length||BigInt(id)<BigInt(messages[0].id)))throw new BotError('Historique supérieur à 500 messages : contexte à réconcilier sans effacer la file');
    return {transport:'bot',url:`https://discord.com/channels/${this.settings.guildId}/${this.settings.channelId}`,group:this.settings.channelId,guildId:this.settings.guildId,channelId:this.settings.channelId,account:this.botId,at:observedAt,atBottom:true,completeHistory,messages};
  }
  proof(raw,intent,attempt){
    const message=this.message(raw);
    return this.identityProof(raw,attempt)&&message.text===intent.text;
  }
  identityProof(raw,attempt){
    const message=this.message(raw);
    return message.self&&(raw.nonce==null||String(raw.nonce)===attempt.nonce)&&snowflake(message.id);
  }
  async verifyObserved(intent,{messageId,observedText}){
    const attempt=this.attempts[intent.id];
    if(!attempt||attempt.textHash!==digest(intent.text)||!snowflake(messageId)||typeof observedText!=='string'||!observedText.length||observedText.length>2000)throw new BotError('Preuve propriétaire incomplète');
    if(attempt.messageId&&attempt.messageId!==messageId)throw new BotError('ID différent de la réponse Discord');
    const raw=await this.get(Routes.channelMessage(this.settings.channelId,messageId));
    if(raw.id!==messageId||!this.identityProof(raw,attempt)||raw.content!==observedText)throw new BotError('Preuve propriétaire non conforme');
    return {messageId,observedTextHash:digest(observedText),noncePresent:raw.nonce!=null};
  }
  async reconcile(intent){
    const attempt=this.attempts[intent.id];
    if(!attempt||attempt.textHash!==digest(intent.text))return {status:'ambiguous'};
    if(attempt.messageId){
      const raw=await this.get(Routes.channelMessage(this.settings.channelId,attempt.messageId));
      if(this.proof(raw,intent,attempt))return {status:'published',messageId:raw.id};
      return {status:'ambiguous'};
    }
    const snapshot=await this.snapshot();
    const found=snapshot.messages.filter(m=>m.self&&m.nonce===attempt.nonce&&m.text===intent.text);
    if(found.length===1){attempt.messageId=found[0].id;this.saveAttempts(this.attempts);return {status:'published',messageId:found[0].id};}
    return {status:'ambiguous'};
  }
  async send(intent,{allowed,anchors=[]}){
    let attempted=false;
    try{
      if(!allowed()||!this.available)throw new BotError('Bot en pause ou déconnecté');
      if(this.attempts[intent.id]){
        attempted=true;const result=await this.reconcile(intent);
        return result.status==='published'?{status:'verified',messageId:result.messageId}:{status:'uncertain',error:'Publication déjà tentée : aucune répétition'};
      }
      if(!intent.text||intent.text.length>2000||/@everyone|@here|<@/i.test(intent.text))throw new BotError('Texte à revoir avant publication');
      const custom=[...intent.text.matchAll(/<(a?):([^>\r\n]*):([0-9]+)>/g)];
      if(custom.length){
        const catalogue=await this.emojis(),known=[...catalogue.application,...catalogue.guild];
        if(custom.some(([,animated,name,id])=>!known.some(e=>e.id===id&&e.name===name&&e.animated===(animated==='a'))))throw new BotError('Emoji personnalisé non autorisé : consulter emojis ou utiliser Unicode');
      }
      const fresh=await this.snapshot({anchors});
      if(this.now()-fresh.at>15000||digest(fresh.messages)!==intent.expected||!allowed()||!this.available)throw new BotError('Contexte modifié, périmé ou envoi annulé');
      if(Object.keys(this.attempts).length>=1000)throw new BotError('Journal de publications plein : archivage propriétaire requis avant un nouvel envoi');
      const attempt={nonce:nonceFor(intent.id),textHash:digest(intent.text),status:'attempted',at:this.now()};
      this.attempts[intent.id]=attempt;this.saveAttempts(this.attempts);
      // The persisted attempt precedes the only POST. The REST library has
      // retries=0 and rejects 429 queues; uncertainty never triggers a retry.
      attempted=true;
      const raw=await this.rest.post(Routes.channelMessages(this.settings.channelId),{signal:this.controller.signal,body:{content:intent.text,nonce:attempt.nonce,enforce_nonce:true,allowed_mentions:{parse:[],replied_user:false}}});
      if(!this.identityProof(raw,attempt))throw new BotError('Identité de l’accusé Discord non conforme');
      attempt.messageId=raw.id;this.saveAttempts(this.attempts);
      if(!this.proof(raw,intent,attempt))throw new BotError('Accusé Discord non conforme');
      const confirmed=await this.get(Routes.channelMessage(this.settings.channelId,raw.id));
      if(!this.proof(confirmed,intent,attempt))throw new BotError('Publication non confirmée');
      attempt.status='verified';this.saveAttempts(this.attempts);
      return {status:'verified',messageId:raw.id};
    }catch(e){return {status:attempted?'uncertain':'notSent',error:safeBotError(e)};}
  }
}
