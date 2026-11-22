import {drawItem} from './art.js';
import {RADII, beginDrop, stepPhysics, replayFrameAt} from './engine.js';

const copy = {
  zh: {
    edition:'单人测试版', title:'烘焙合成赛', rules:'游戏规则', board:'点心棋盘', score:'得分', now:'手中', next:'下一块',
    welcome:'开始一局烘焙挑战', setup:'服务器为每位玩家独立随机出件。你可以看到手中点心和下一块预览。', start:'开始游戏',
    change:'重新开局', changeCopy:'开始新一局会清空棋盘，重新随机抽取点心。', back:'返回当前游戏',
    over:'本局结束', result:'最终得分 {score}，共投放 {drops} 块点心。再开一局，挑战新的随机顺序。', again:'再玩一局', newGame:'重新开局',
    hint:'点按棋盘投放，或按住横向拖动后松手。键盘可用左右键瞄准，空格或回车投放。',  moves:'已投放', ready:'可以投放下一块。', danger:'红线',
    guide:'点心合并图鉴', guideIntro:'按等级从小到大排列。分值表示合成该点心一次所得的分数。', starter:'起始等级', points:'分',
    items:['','曲奇','可颂','甜甜圈','丹麦酥','扭结面包','香肠卷','巧克力面包','酸种面包','蛋挞','巨型蛋挞'],
    sections:[
      ['目标与出件','从空棋盘开始，在点心堆触及红线前尽量多得分。手中和下一块点心会显示在棋盘上方。新投放的点心只从曲奇、可颂、甜甜圈、丹麦酥这四种中抽取。'],
      ['瞄准与投放','点按想要的横向位置，或按住棋盘左右拖动，松手后点心垂直落下。使用键盘时先选中棋盘，用左右键瞄准，空格或回车投放。每次只能投放一块；上一块的下落和碰撞动画结束后才能再次投放。'],
      ['怎样合并与计分','两块相同的点心接触后会合成一块高一级的点心。例如两块曲奇合成可颂得 30 分，两块可颂合成甜甜圈得 40 分。新点心还能继续连锁合并，每次分数累加。单纯投放得 0 分。巨型蛋挞是最高级，两块巨型蛋挞也会留在棋盘上。'],
      ['结束与重玩','任何一块点心的顶部在运动中碰到或越过红线，本局立即结束。服务器为每位玩家逐次独立抽取点心。每次有效投放后，预览的点心来到手中，再抽取一块新的预览。游戏中可以随时切换语言。']
    ]
  },
  en: {
    edition:'Solo test', title:'Bakehouse Merge', rules:'Game rules', board:'Pastry board', score:'Score', now:'In hand', next:'Up next',
    welcome:'Start a baking challenge', setup:'The server draws pastries independently for each player. You can see the pastry in hand and one preview.', start:'Start game',
    change:'Start a new game', changeCopy:'Starting a new game clears your board and draws fresh pastries.', back:'Return to this game',
    over:'Game over', result:'Final score {score} from {drops} drops. Play again for a fresh draw.', again:'Play again', newGame:'New game',
    hint:'Tap to drop, or press and drag sideways, then release. With the board focused, use the arrow keys to aim and Space or Enter to drop.',
     moves:'Drops', ready:'Ready for the next drop.', danger:'Limit',
    guide:'Pastry merge guide', guideIntro:'Read from the smallest tier to the largest. The points shown are awarded each time you make that pastry.', starter:'Starting tier', points:'pts',
    items:['','Cookie','Croissant','Doughnut','Danish','Pretzel','Sausage roll','Pain au chocolat','Sourdough','Egg tart','Giant egg tart'],
    sections:[
      ['Goal and pastry order','Start with an empty board and score as many points as you can before the pile reaches the red line. The panel above the board shows the pastry in hand and the one coming next. Each new drop is a cookie, croissant, doughnut or Danish.'],
      ['Aim and drop','Tap a position on the board, or hold and drag sideways, then release. The pastry falls from that position. On a keyboard, focus the board, aim with the arrow keys and press Space or Enter. You can drop one pastry at a time, once the previous drop animation finishes.'],
      ['Merges and scoring','Two touching pastries of the same type merge into the next tier. Two cookies make a croissant for 30 points. Two croissants make a doughnut for 40. The new pastry can merge again in a chain, and each merge adds points. A drop alone scores zero. Giant egg tarts are the final tier and stay on the board when they touch.'],
      ['Game over and replay','The game ends as soon as the top of any pastry touches or crosses the red line during a drop. After each accepted drop, the preview becomes your pastry in hand and the server draws a new preview. Each player receives independent draws. You can switch languages at any time.']
    ]
  }
};

Object.assign(copy.zh,{network:'正在连接服务器，恢复后将继续本局。',working:'正在开局…',expired:'本局已过期，可以开始新一局。'});
Object.assign(copy.en,{network:'Reconnecting to the server. Your game will resume.',working:'Starting…',expired:'This session has expired. Start a new game.'});
const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
if(!ctx)throw new Error('Canvas is unavailable');
const params = new URLSearchParams(location.search);
let savedLanguage;
try { savedLanguage = localStorage.getItem('bakehouse-test-lang'); } catch {}
const requestedLanguage = params.get('lang');
let lang = ['zh','en'].includes(requestedLanguage) ? requestedLanguage : ['zh','en'].includes(savedLanguage) ? savedLanguage : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
let game = null, panel = 'welcome', move = null, aim = 260, pointer = null, animation = 0;
const W = 520, H = 680;
const endpoint='https://intranet.ximarketing.ai/games/bakehouse/api/practice';
const storageKey='bakehouse-practice-session-v1';
let session=null,busy=false,feedback='',retryTimer=0;
try { session=JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
function remember(value){
  session=value;
  try { if(value) sessionStorage.setItem(storageKey,JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch {}
}
function message(key){
  feedback=key;
  $('feedback').hidden=!key;
  $('feedback').textContent=copy[lang][key]||'';
}
async function request(path,body,token){
  const headers={};
  if(body)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const res=await fetch(endpoint+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,
      credentials:'omit',cache:'no-store',signal:controller.signal});
    if(!res.ok)throw Object.assign(new Error('Game request failed'),{status:res.status});
    return await res.json();
  } finally {clearTimeout(timeout);}
}
function pastryIcon(c, level, radius = 25) {
  const context = c.getContext('2d');
  context.clearRect(0,0,c.width,c.height);
  if (level) drawItem(context,level,c.width/2,c.height/2,radius);
}
function format(n) { return n.toLocaleString(lang === 'zh' ? 'zh-Hans' : 'en'); }
function dashboard() {
  const t = copy[lang];
  $('score').textContent = format(game?.score ?? 0);
  for (const [key,level] of [['now',game?.current],['next',game?.next]]) {
    $(key).textContent = level ? t.items[level] : '—';
    pastryIcon($(key+'-icon'),level);
  }
  $('drop-info').textContent=game ? t.moves+' '+format(game.drops) : '';
}
function drawBoard() {
  const ratio = Math.min(devicePixelRatio || 1,2);
  const width = Math.round(W*ratio), height = Math.round(H*ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width=width; canvas.height=height; }
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.fillStyle='#fffcf7'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#e4d7c5';
  for (let x=16;x<W;x+=32) for(let y=16;y<H;y+=32) ctx.fillRect(x,y,1.5,1.5);
  ctx.strokeStyle='#c3614b';ctx.lineWidth=1.8;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(0,50);ctx.lineTo(W,50);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#974938';ctx.font='15px sans-serif';ctx.fillText(copy[lang].danger,12,40);
  for(const b of move?.board ?? game?.board ?? []) drawItem(ctx,b.l,b.x,b.y,b.r);
  if(game && !game.dead && !move && !panel) {
    const radius=RADII[game.current], x=clampAim(aim);
    ctx.setLineDash([4,7]);ctx.strokeStyle='#b39673';ctx.beginPath();ctx.moveTo(x,51);ctx.lineTo(x,H-5);ctx.stroke();ctx.setLineDash([]);
    drawItem(ctx,game.current,x,50+radius+4,radius,.65);
  }
}
function panelUI() {
  const t = copy[lang];
  $('overlay').hidden = !panel;
  canvas.tabIndex = panel ? -1 : 0;
  $('new-game').hidden = !!panel;
  $('new-game').disabled=busy;
  $('start').disabled=busy;
  $('resume').disabled=busy;
  if(!panel) return;
  $('setup-heading').textContent = t[panel];
  $('setup-copy').textContent = panel === 'over' ? t.result.replace('{score}',format(game.score)).replace('{drops}',format(game.drops)) : panel === 'change' ? t.changeCopy : t.setup;
  $('start').textContent = panel === 'over' ? t.again : t.start;
  $('resume').hidden = panel !== 'change';
}
function translate() {
  const t = copy[lang];
  document.documentElement.lang = lang==='zh'?'zh-Hans':'en';
  document.title = t.title+' · '+t.edition;
  document.querySelectorAll('[data-i]').forEach(el=>{el.textContent=t[el.dataset.i];});
  document.querySelectorAll('[data-lang]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.lang===lang)));
  canvas.setAttribute('aria-label',t.board);
  message(feedback);
  const instructions=$('instructions');instructions.textContent='';
  for(const [heading,body] of t.sections){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=heading;dd.textContent=body;instructions.append(dt,dd);
  }
  const ladder=$('ladder');ladder.textContent='';
  t.items.slice(1).forEach((name,i)=>{
    const li=document.createElement('li'), icon=document.createElement('canvas'), label=document.createElement('div'), points=document.createElement('span');
    icon.width=64;icon.height=64;icon.setAttribute('aria-hidden','true');
    pastryIcon(icon,i+1,14+i*1.7);label.textContent=(i+1)+'. '+name; points.textContent=i===0?t.starter:'+'+((i+2)*10)+' '+t.points;
    label.append(points);li.append(icon,label);ladder.append(li);
  });
  $('announcement').textContent='';
  panelUI();dashboard();drawBoard();
}
function showState(state,animate=false){
  cancelAnimationFrame(animation);move=null;pointer=null;
  const last=state.lastMove;
  game={...state,dead:state.status==='finished'};
  if(animate && last){
    panel=null;
    game.current=last.level;game.next=state.current;game.score=last.score;
    const elapsed=Math.max(0,state.serverNow-last.at);
    move={state,board:beginDrop(last.board,last.level,last.x),frame:0,start:performance.now()-elapsed,
      outcome:{contactFrame:last.contactFrame,endFrame:last.endFrame}};
    animation=requestAnimationFrame(tick);
  }else{
    panel=game.dead?'over':null;
  }
  panelUI();dashboard();drawBoard();
}
function later(action){clearTimeout(retryTimer);retryTimer=setTimeout(action,1500);}
function expired(){
  remember(null);game=null;move=null;panel='welcome';busy=false;message('expired');panelUI();dashboard();drawBoard();
}
async function openSession(){
  if(!session)return;
  busy=true;panelUI();
  try{
    const saved=session;
    const result=saved.token ? await request('/'+saved.id,null,saved.token) : await request('',{key:saved.key});
    if(!saved.token)remember({id:result.id,token:result.token});
    busy=false;message('');showState(result.game);if(!game.dead)canvas.focus({preventScroll:true});
  }catch(err){
    if([403,404].includes(err.status)&&session.token){expired();return;}
    message('network');later(openSession);
  }
}
function sessionKey(){
  const bytes=crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes,b=>('0'+b.toString(16)).slice(-2)).join('');
}
function begin(){
  if(busy)return;
  clearTimeout(retryTimer);aim=W/2;remember({key:sessionKey()});openSession();
}
function tick(now) {
  if(!move) return;
  const {outcome}=move;
  const frame=replayFrameAt(now-move.start,outcome.contactFrame,outcome.endFrame);
  while(move.frame<frame) {
    const next=stepPhysics(move.board);move.board=next.board;move.frame++;
    game.score+=next.points;
    if(next.points) $('score').textContent=format(game.score);
  }
  if(move.frame>=outcome.endFrame) {
    const final=move.state;
    showState(final);
    $('announcement').textContent=game.dead ? copy[lang].over+' '+format(game.score) : copy[lang].ready;
    if(game.dead)$('start').focus({preventScroll:true});
  } else { animation=requestAnimationFrame(tick); }
  drawBoard();
}
function clampAim(x) {
  const margin=(game ? RADII[game.current] : 0)+4;
  return Math.max(margin,Math.min(W-margin,x));
}
async function sendDrop(body){
  try{
    const result=await request('/'+session.id+'/moves',body,session.token);
    busy=false;message('');showState(result.game,true);
  }catch(err){
    if([403,404].includes(err.status)){expired();return;}
    if(err.status===409){openSession();return;}
    if(err.status!==429)message('network');
    later(()=>sendDrop(body));
  }
}
function drop(){
  if(busy||panel||move||!game||game.dead)return;
  busy=true;panelUI();sendDrop({drop:game.drops+1,x:clampAim(aim)});
}
function aimAt(e) { const rect=canvas.getBoundingClientRect();aim=clampAim((e.clientX-rect.left)*W/rect.width);drawBoard(); }
canvas.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||panel||move||!game)return;
  pointer=e.pointerId;canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});aimAt(e);
});
canvas.addEventListener('pointermove',e=>{if(!panel&&!move&&(e.pointerId===pointer||(pointer===null&&e.pointerType==='mouse')))aimAt(e);});
canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;pointer=null;aimAt(e);drop();});
for(const name of ['pointercancel','lostpointercapture']) canvas.addEventListener(name,e=>{if(pointer===e.pointerId)pointer=null;});
canvas.addEventListener('keydown',e=>{
  if(panel||move||!game)return;
  if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();aim=clampAim(aim+(e.key==='ArrowLeft'?-10:10));drawBoard();}
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)drop();}
});
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{
  lang=button.dataset.lang;try{localStorage.setItem('bakehouse-test-lang',lang);}catch{}
  const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(null,'',url);translate();
}));
$('setup-form').addEventListener('submit',e=>{e.preventDefault();begin();});
$('new-game').addEventListener('click',()=>{
  if(busy||!game)return;
  if(move){cancelAnimationFrame(animation);tick(move.start+1200);}
  if(game.dead)return;
  panel='change';panelUI();drawBoard();$('start').focus({preventScroll:true});
});
$('resume').addEventListener('click',()=>{if(!busy){panel=null;panelUI();drawBoard();canvas.focus({preventScroll:true});}});
translate();
document.documentElement.dataset.gameReady='true';
$('startup-note').hidden=true;
if(session?.key || (session?.id && session?.token)) openSession();
