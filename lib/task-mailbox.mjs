import fs from 'node:fs';
import path from 'node:path';
export function taskMailbox(engine,runtime){
  const input=path.join(runtime,'task-command.json'),output=path.join(runtime,'task-result.json'),view=path.join(runtime,'task-view.json');
  let running=false;
  const write=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);};
  const update=()=>write(view,{...engine.inspect(),hostUpdatedAt:Date.now()});
  async function tick(){
    update();if(running||!fs.existsSync(input))return;running=true;
    let command;
    try{command=JSON.parse(fs.readFileSync(input,'utf8'));fs.unlinkSync(input);
      if(!command.id)throw new Error('Commande sans identifiant');
      let result;
      if(engine.command)result=await engine.command(command);
      else if(command.action==='pause'){engine.setMode('paused');result={ok:true,mode:'paused'};}
      else if(command.action==='inspect')result={ok:true,view:await engine.inspectFresh()};
      else if(command.action==='emojis'){
        if(!engine.emojis)throw new Error('Catalogue réservé au bot');
        result={ok:true,emojis:await engine.emojis()};
      }
      else if(command.action==='resolve'){engine.resolve({id:command.outboxId,messageId:command.messageId,discard:command.discard===true});result={ok:true};}
      else if(command.action==='recover')result=await engine.recoverOutbox(command.outboxId);
      else if(command.action==='recover-observed'){
        if(!engine.recoverObserved)throw new Error('Récupération réservée au bot');
        result=await engine.recoverObserved(command);
      }
      else if(command.action==='diagnose')result=await engine.reconcileOutbox(command.outboxId);
      else result=await engine.respond(command);
      write(output,{id:command.id,...result});
    }catch(e){write(output,{id:command?.id||null,error:e.message});}
    finally{running=false;update();}
  }
  update();const timer=setInterval(()=>tick().catch(e=>engine.fail(e)),1000);timer.unref();
  return ()=>{clearInterval(timer);write(view,{...engine.inspect(),mode:'paused',hostUpdatedAt:0});};
}
