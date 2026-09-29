const $=s=>document.querySelector(s);let current={},dirty=false,first=true;
function navigate(name){name=name==='settings'?'settings':'overview';for(const view of document.querySelectorAll('.view'))view.hidden=view.id!==name;for(const button of document.querySelectorAll('.nav'))button.classList.toggle('active',button.dataset.view===name);location.hash=name;}
async function command(message){const result=await window.astroDesktop.command(message);if(result.error&&!result.mode){$('#error').textContent=result.error;$('#error').hidden=false;return;}render(result);}
function render(status){current={...current,...status};const s=current,editable=s.mode==='paused'&&!s.busy&&!s.starting&&!s.switching&&!s.outbox&&!s.queued;
 $('#error').hidden=!s.error;$('#error').textContent=s.error||'';
 const label={paused:'En pause',observe:'Observer',wake:'Actif'}[s.mode]||'En pause';$('#status-label').textContent=label.toUpperCase();$('#metric-mode').textContent=label;
 $('#connection-state').textContent=s.connected?'Gateway connecté':'Déconnecté';$('#metric-channels').textContent=s.channelCount||0;$('#metric-queue').textContent=s.queued||0;$('#metric-calls').textContent=s.metrics?.wakeups||0;
 $('#outbox-state').textContent=s.outbox?'Publication en attente de vérification : mettre en pause et consulter le contrôleur.':'Aucune publication incertaine.';
 if(!dirty)for(const [id,key] of [['guild-id','guildId'],['channel-id','channelId'],['target-thread','targetThread'],['codex-executable','codexExecutable']])$('#'+id).value=s.botSettings?.[key]||'';
 for(const id of ['guild-id','channel-id','channel-link','target-thread','codex-executable','bot-token','save-connection','remove-token'])$('#'+id).disabled=!editable;
 for(const button of document.querySelectorAll('[data-mode="observe"],[data-mode="wake"]'))button.disabled=!!s.configurationBlocked||!!s.starting||!!s.switching||!!s.outbox;
 $('#token-status').textContent=s.tokenStored?'Jeton chiffré enregistré. Sa valeur n’est jamais affichée.':'Aucun jeton enregistré.';
 $('#connection-help').textContent=s.starting?'Connexion et vérification en cours…':s.configurationBlocked?'Renseignez le serveur, la conversation et le jeton pour activer.':'Prêt pour Observer. Tous les salons texte accessibles de ce serveur seront suivis.';
 if(first){first=false;navigate(s.configurationBlocked?'settings':location.hash.slice(1));}
}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>navigate(button.dataset.view);
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>command({type:'mode',mode:button.dataset.mode});
for(const input of document.querySelectorAll('input'))input.oninput=()=>{dirty=true;};
$('#channel-link').oninput=()=>{dirty=true;const match=$('#channel-link').value.trim().match(/^https:\/\/discord\.com\/channels\/([1-9]\d{15,21})\/([1-9]\d{15,21})\/?$/);if(match){$('#guild-id').value=match[1];$('#channel-id').value=match[2];}};
async function save(removeToken=false){const message={type:'saveConnection',settings:{transport:'bot',guildId:$('#guild-id').value.trim(),channelId:$('#channel-id').value.trim(),targetThread:$('#target-thread').value.trim(),codexExecutable:$('#codex-executable').value.trim()},token:$('#bot-token').value,removeToken};$('#bot-token').value='';dirty=false;try{await command(message);}finally{message.token='';}}
$('#save-connection').onclick=()=>save();$('#remove-token').onclick=()=>save(true);
if(window.astroDesktop){window.astroDesktop.onStatus(render);void command({type:'getStatus'});}else{$('#error').textContent='Ouvrez cette interface depuis Astro.';$('#error').hidden=false;for(const b of document.querySelectorAll('[data-mode],#save-connection,#remove-token'))b.disabled=true;}
