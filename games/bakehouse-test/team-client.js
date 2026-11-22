const API='https://intranet.ximarketing.ai/games/bakehouse/api/teams/';
const prefix='bakehouse-team-v1:';
function read(key){try{return JSON.parse(localStorage.getItem(prefix+key));}catch{return null;}}
function write(key,value){localStorage.setItem(prefix+key,JSON.stringify(value));}
async function request(path,body,token){
  const headers={};
  if(body) headers['Content-Type']='application/json';
  if(token) headers.Authorization='Bearer '+token;
  const r=await fetch(API+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  const data=await r.json();
  if(!r.ok) throw Object.assign(new Error(data.error),{status:r.status});
  return data;
}
export class TeamClient {
  constructor(update,warning){this.update=update;this.warning=warning;this.generation=0;this.busy=false;}
  async lookup(code){return request(code);}
  remembered(code){return read(code);}
  latest(){return read('last');}
  async join(code,team,name){
    const generation=this.generation;
    let identity=read(code);
    if(!identity){
      identity={code,team,name,key:crypto.randomUUID()};
      write(code,identity);
    }
    if(identity.team!==team||identity.name!==name) throw Object.assign(new Error('Use the registered team and name.'),{status:409});
    let state;
    try{state=await request(code+'/join',{team,name,joinKey:identity.key});}
    catch(e){if(!identity.token&&[400,404,409].includes(e.status))localStorage.removeItem(prefix+code);throw e;}
    Object.assign(identity,{id:state.id,token:state.playerToken});
    write(code,identity);write('last',code);
    if(generation===this.generation)this.connect(identity,state);
  }
  connect(identity,state){
    this.stop();this.identity=identity;
    if(state)this.accept(state);
    this.schedule(state?600:0);
  }
  stop(){this.generation++;clearTimeout(this.timer);this.identity=null;this.state=null;this.busy=false;}
  accept(state){
    this.state=state;this.received=performance.now();
    this.update(state,this.identity);
  }
  now(){return this.state ? this.state.serverNow+performance.now()-this.received : 0;}
  schedule(ms){clearTimeout(this.timer);if(this.identity&&this.state?.game?.status!=='finished')this.timer=setTimeout(()=>this.poll(),ms);}
  async poll(){
    if(this.busy)return;
    const gen=this.generation,p=this.identity;if(!p)return;
    this.busy=true;
    try{const state=await request(p.code+'/players/'+p.id,null,p.token);if(gen===this.generation)this.accept(state);}
    catch(e){if(gen===this.generation)this.warning(e);}
    finally{if(gen===this.generation){this.busy=false;this.schedule(650);}}
  }
  async move(x){
    const state=this.state,g=state?.game,p=this.identity,gen=this.generation;
    if(!p||!g||g.status==='finished'||this.busy||this.now()<g.readyAt)return false;
    clearTimeout(this.timer);this.busy=true;
    try{
      const fresh=await request(p.code+'/players/'+p.id+'/moves',{drop:g.drops+1,x},p.token);
      if(gen===this.generation)this.accept(fresh);
    }catch(e){
      if(gen===this.generation){
        if(e.status!==429)this.warning(e);
        // Get the authoritative turn before another action after a lost response.
        this.state=null;
      }
    }finally{if(gen===this.generation){this.busy=false;this.schedule(100);}}
    return true;
  }
}
