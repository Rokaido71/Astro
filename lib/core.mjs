import { createHash, randomUUID } from 'node:crypto';
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateSnapshot(s,c,now=Date.now()) {
  const bot=c.transport==='bot';
  const base=bot?`https://discord.com/channels/${c.guildId}/${c.channelId}`:`https://discord.com/channels/@me/${c.group}`;
  const allowed=typeof s?.url==='string'&&(s.url===base||(s.url.startsWith(base+'/')&&/^\d{16,22}$/.test(s.url.slice(base.length+1))));
  if(!s || s.group!==c.group || s.account!==c.account || !allowed) throw new Error('Compte ou groupe non confirmé');
  if(bot&&(s.transport!=='bot'||s.guildId!==c.guildId||s.channelId!==c.channelId||!/^\d{16,22}$/.test(c.account||'')))throw new Error('Identité ou salon bot non confirmé');
  if(!s.atBottom || !Number.isFinite(s.at) || Math.abs(now-s.at)>15000) throw new Error('Vue incomplète ou périmée');
  if(!Array.isArray(s.messages) || (!bot&&!s.messages.length) || s.messages.length>500) throw new Error('Messages absents ou fenêtre trop grande');
  const ids=new Set();
  for(const m of s.messages) {
    if(!/^\d{16,22}$/.test(m.id) || ids.has(m.id) || typeof m.text!=='string' || m.text.length>50000 || typeof m.author!=='string' || !m.author || !Array.isArray(m.attachments)) throw new Error('Message incomplet');
    ids.add(m.id);
  }
  return s;
}
export class Engine {
  constructor({config,state={},save=()=>{},generate,send,emit=()=>{},now=Date.now}) {
    this.c=config; this.s={seen:{},queue:[],context:[],baseline:false,outbox:null,threadId:null,...state};
    this.save=save; this.generate=generate; this.send=send; this.emit=emit; this.now=now;
    this.mode='paused'; this.busy=false; this.epoch=0; this.latest=null; this.timer=null;
    this.s.metrics??={generations:0,received:0,lastDurationMs:null};
    if(this.s.outbox && this.s.outbox.status!=='notSent') this.s.outbox.status='uncertain';
    this.persist();
  }
  persist() { this.save(this.s); }
  status() { return {models:this.models||[],modelsLoading:!!this.modelsLoading,modelsError:this.modelsError||null,mode:this.mode,queued:this.s.queue.length,busy:this.busy,baseline:this.s.baseline,outbox:this.s.outbox,error:this.error||null,model:this.c.model||null,effort:this.c.effort||'',metrics:this.s.metrics,automaticSendingValidated:this.c.automaticSendingValidated}; }
  setMode(mode) {
    if(!['paused','observe','draft','live','wake'].includes(mode)) throw new Error('Mode inconnu');
    if(['draft','live'].includes(mode)&&!this.c.model) throw new Error('Choisir explicitement le modèle avant génération');
    if(mode==='live'&&!this.c.automaticSendingValidated) throw new Error('Validation réelle préalable des capacités et des envois requise');
    this.mode=mode; this.epoch++; clearTimeout(this.timer); this.timer=null; this.firstAt=null;
    this.emit({type:'status',...this.status()});
  }
  ingest(snapshot) {
    if(this.mode==='paused') return;
    validateSnapshot(snapshot,this.c,this.now());
    const previous=this.latest; this.latest=snapshot;
    const cursor=this.s.cursor;
    if(this.s.baseline && cursor && !snapshot.messages.some(m=>m.id===cursor)) {
      // Deleted messages (from any author) may remove the cursor. A surviving
      // earlier anchor in this complete bottom window establishes overlap.
      // Without overlap, never assume a deletion or discard queued requests.
      const index=this.s.context.findIndex(m=>m.id===cursor),old=this.s.context[index];
      const visibleIds=new Set(snapshot.messages.map(m=>m.id));
      let anchorPosition=index-1;
      while(anchorPosition>=0&&!visibleIds.has(this.s.context[anchorPosition].id))anchorPosition--;
      const anchor=this.s.context[anchorPosition];
      if((index<0||anchorPosition<0)&&!(this.c.transport==='bot'&&snapshot.completeHistory===true))throw new Error('Repère absent : récupérer le contexte avant de poursuivre');
      const anchorIndex=anchor?snapshot.messages.findIndex(m=>m.id===anchor.id):-1;
      const withoutId=m=>{const {id,...rest}=m;return digest(rest);};
      const replacements=old?.self&&anchorIndex>=0?snapshot.messages.slice(anchorIndex+1).filter(m=>m.self&&withoutId(m)===withoutId(old)):[];
      if(replacements.length===1&&this.s.lastSent?.id===cursor)this.s.lastSent.id=replacements[0].id;
    }
    // Only reconcile deletions inside the overlapping rendered interval.
    // Older requests outside the current window remain pending.
    const visible=new Set(snapshot.messages.map(m=>m.id));
    const overlap=this.s.context.findIndex(m=>visible.has(m.id));
    if(overlap>=0||(this.c.transport==='bot'&&snapshot.completeHistory===true)){
      const previousMessages=this.c.transport==='bot'&&snapshot.completeHistory===true?[...this.s.context,...this.s.queue]:this.s.context.slice(overlap);
      const deleted=new Set(previousMessages.filter(m=>!visible.has(m.id)).map(m=>m.id));
      this.s.queue=this.s.queue.filter(m=>!deleted.has(m.id));
    }
    if(!this.s.baseline) {
      for(const m of snapshot.messages) this.s.seen[m.id]=digest(m);
      this.s.baseline=true;
    } else {
      for(const m of snapshot.messages) {
        const version=digest(m);
        if(this.s.seen[m.id]===version) continue;
        this.s.seen[m.id]=version;
        if(m.self||(this.c.transport==='bot'&&m.ignored)) continue;
        const index=this.s.queue.findIndex(q=>q.id===m.id);
        if(index<0) {this.s.queue.push(m);this.s.metrics.received++;} else this.s.queue[index]=m;
      }
    }
    this.s.cursor=snapshot.messages.at(-1)?.id||null;
    this.s.context=snapshot.messages.slice(-40);
    // Retain current-window versions plus queued messages, not unlimited history.
    const keep=new Set([...snapshot.messages,...this.s.queue].map(m=>m.id));
    this.s.seen=Object.fromEntries(Object.entries(this.s.seen).filter(([id])=>keep.has(id)));
    this.persist();
    if(this.s.queue.length>500) throw new Error('File pleine : intervention nécessaire, aucune demande supprimée');
    if(this.s.queue.length && !this.busy && !this.s.outbox && ['draft','live','wake'].includes(this.mode)) this.schedule();
    if(!previous) this.emit({type:'status',...this.status()});
  }
  schedule() {
    this.firstAt??=this.now(); clearTimeout(this.timer);
    const delay=Math.max(0,Math.min(this.c.debounceMs,this.c.maxWaitMs-(this.now()-this.firstAt)));
    this.timer=setTimeout(()=>this.flush().catch(e=>this.fail(e)),delay);
  }
  fail(e) { this.error=e.message; this.setMode('paused'); this.persist(); this.emit({type:'status',...this.status()}); }
  async flush() {
    clearTimeout(this.timer); this.timer=null; this.firstAt=null;
    if(this.busy || this.s.outbox || !this.s.queue.length || !['draft','live'].includes(this.mode)) return;
    this.busy=true; const epoch=this.epoch;
    const batch=this.s.queue.map(m=>({...m})); const expected=digest(this.latest.messages);
    try {
      const started=this.now();this.s.metrics.generations++;this.persist();
      const result=await this.generate({messages:batch,context:this.s.context,threadId:this.s.threadId});
      this.s.metrics.lastDurationMs=this.now()-started;
      if(result.threadId) this.s.threadId=result.threadId;
      if(epoch!==this.epoch || this.mode==='paused') return;
      if(!['reply','silent','needs_owner'].includes(result.action) || typeof result.text!=='string') throw new Error('Réponse structurée invalide');
      if(digest(this.latest.messages)!==expected) { this.emit({type:'notice',text:'Discussion modifiée pendant la génération : nouvelle analyse requise.'}); return; }
      const complete=()=>{const versions=new Map(batch.map(m=>[m.id,digest(m)]));this.s.queue=this.s.queue.filter(m=>versions.get(m.id)!==digest(m));};
      if(result.action==='silent') { complete(); return; }
      this.s.outbox={id:randomUUID(),text:result.text,expected,status:'draft',requestIds:batch.map(m=>m.id)};
      this.persist(); this.emit({type:'draft',...this.s.outbox});
      if(result.action==='needs_owner' || this.mode!=='live' || result.text.length>2000) return;
      // Persist intent BEFORE any external effect. Restart never retries blindly.
      this.s.outbox.status='sending'; this.persist();
      const receipt=await this.send({...this.s.outbox,epoch});
      if(receipt?.status!=='verified' || !/^\d{16,22}$/.test(receipt.messageId)) throw new Error('Envoi incertain : vérifier dans Discord, pas de réessai automatique');
      this.s.lastSent={id:receipt.messageId,text:result.text}; complete(); this.s.outbox=null;
    } finally {
      this.busy=false; this.persist(); this.emit({type:'status',...this.status()});
      if(this.s.queue.length && !this.s.outbox && ['draft','live'].includes(this.mode)) this.schedule();
    }
  }
  resolve({id,messageId,discard=false}) {
    if(!this.s.outbox || this.s.outbox.id!==id) throw new Error('Brouillon introuvable');
    if(!discard && !/^\d{16,22}$/.test(messageId||'')) throw new Error('ID de publication vérifiée requis');
    if(!discard) {
      this.s.lastSent={id:messageId,text:this.s.outbox.text}; const ids=new Set(this.s.outbox.requestIds); this.s.queue=this.s.queue.filter(m=>!ids.has(m.id));
      const publicationError=this.s.outbox.error;
      if(/^Publication non confirmée :|^Envoi incertain :/.test(this.error||'')&&publicationError&&(this.error===publicationError||this.error==='Publication non confirmée : '+publicationError))this.error=null;
    }
    this.s.outbox=null; this.persist();
  }
}
