const KEY='bakehouse-strategy-v1';
export class Strategy {
  constructor(frame){
    this.frame=frame;this.serial=0;this.requests=new Map();
    this.ready=new Promise(resolve=>{this.frameReady=resolve;});
    window.addEventListener('message',e=>{
      if(e.source!==frame.contentWindow||e.origin!=='null')return;
      if(e.data?.sandboxReady){this.frameReady();return;}
      const item=this.requests.get(e.data?.id);
      if(!item)return;this.requests.delete(e.data.id);clearTimeout(item.timeout);
      if(e.data.error)item.reject(new Error('strategy'));else item.resolve(e.data);
    });
    frame.src='./strategy-sandbox.html';
  }
  async send(type,data){
    await this.ready;
    const id=++this.serial;
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{this.requests.delete(id);reject(new Error('timeout'));},6500);
      this.requests.set(id,{resolve,reject,timeout});
      this.frame.contentWindow.postMessage({type,id,...data},'*');
    });
  }
  saved(){try{return JSON.parse(localStorage.getItem(KEY));}catch{return null;}}
  async load(name,source,persist=true){
    this.active=false;
    const result=await this.send('load',{source});
    if(!result.ready)throw new Error('strategy');
    this.name=name;this.source=source;
    if(persist){try{localStorage.setItem(KEY,JSON.stringify({name,source}));}catch{return false;}}
    return true;
  }
  async reset(){if(this.source)await this.load(this.name,this.source,false);}
  async choose(g){
    const {x}=await this.send('turn',{state:{version:1,board:g.board.map(({l,r,x,y,vx,vy})=>({l,r,x,y,vx,vy})),current:g.current,next:g.next}});
    if(!Number.isFinite(x)||x<0||x>520)throw new Error('position');
    return x;
  }
}
