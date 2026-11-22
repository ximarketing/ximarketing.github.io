import {TeamClient} from './team-client.js';
import {Strategy} from './strategy.js';
import {drawItem} from './art.js';
import {RADII, beginDrop, stepPhysics, simulateDrop, replayFrameAt} from './engine.js';

const copy = {
  zh: {
    edition:'学生版', title:'烘焙合成赛', rules:'游戏规则', board:'点心棋盘', score:'得分', now:'手中', next:'下一块',
    seed:'游戏种子', random:'随机选一个', range:'请输入 1 至 4294967295 之间的整数。', invalid:'种子超出范围，或含有数字以外的字符。',
    welcome:'选一个种子开局', setup:'这个数字决定整局点心的出场顺序。分享数字，朋友就能挑战同一局。', start:'开始游戏',
    change:'重新开局', changeCopy:'沿用当前种子，或输入新数字。按「开始游戏」后，本局进度将重置。', back:'返回当前游戏',
    over:'本局结束', result:'最终得分 {score}，共投放 {drops} 块点心。保留种子再试一次，或换个数字开局。', again:'再玩一局', newGame:'重新开局',
    hint:'点按棋盘投放，或按住横向拖动后松手。键盘可用左右键瞄准，空格或回车投放。', activeSeed:'种子', moves:'已投放', ready:'可以投放下一块。', danger:'红线',
    guide:'点心合并图鉴', guideIntro:'按等级从小到大排列。分值表示合成该点心一次所得的分数。', starter:'起始等级', points:'分',
    items:['','曲奇','可颂','甜甜圈','丹麦酥','扭结面包','香肠卷','巧克力面包','酸种面包','蛋挞','巨型蛋挞'],
    sections:[
      ['目标与出件','从空棋盘开始，在点心堆触及红线前尽量多得分。手中和下一块点心会显示在棋盘上方。新投放的点心只从曲奇、可颂、甜甜圈、丹麦酥这四种中抽取。'],
      ['瞄准与投放','点按想要的横向位置，或按住棋盘左右拖动，松手后点心垂直落下。使用键盘时先选中棋盘，用左右键瞄准，空格或回车投放。每次只能投放一块；上一块的下落和碰撞动画结束后才能再次投放。'],
      ['怎样合并与计分','两块相同的点心接触后会合成一块高一级的点心。例如两块曲奇合成可颂得 30 分，两块可颂合成甜甜圈得 40 分。新点心还能继续连锁合并，每次分数累加。单纯投放得 0 分。巨型蛋挞是最高级，两块巨型蛋挞也会留在棋盘上。'],
      ['结束与重玩','任何一块点心的顶部在运动中碰到或越过红线，本局立即结束。相同种子的出件顺序相同；落点不同，碰撞、合并和终局分数也可能不同。游戏中可以随时切换语言。']
    ]
  },
  en: {
    edition:'Student edition', title:'Bakehouse Merge', rules:'Game rules', board:'Pastry board', score:'Score', now:'In hand', next:'Up next',
    seed:'Game seed', random:'Randomize', range:'Enter a whole number from 1 to 4294967295.', invalid:'Enter digits only, within the range shown.',
    welcome:'Pick a seed to play', setup:'This number sets the pastry order for your whole game. Share it with a friend to try the same challenge.', start:'Start game',
    change:'Start a new game', changeCopy:'Keep this seed or enter another. Starting a game resets your current run.', back:'Return to this game',
    over:'Game over', result:'Final score {score} from {drops} drops. Keep the seed to play again, or enter a new one.', again:'Play again', newGame:'New game',
    hint:'Tap to drop, or press and drag sideways, then release. With the board focused, use the arrow keys to aim and Space or Enter to drop.',
    activeSeed:'Seed', moves:'Drops', ready:'Ready for the next drop.', danger:'Limit',
    guide:'Pastry merge guide', guideIntro:'Read from the smallest tier to the largest. The points shown are awarded each time you make that pastry.', starter:'Starting tier', points:'pts',
    items:['','Cookie','Croissant','Doughnut','Danish','Pretzel','Sausage roll','Pain au chocolat','Sourdough','Egg tart','Giant egg tart'],
    sections:[
      ['Goal and pastry order','Start with an empty board and score as many points as you can before the pile reaches the red line. The panel above the board shows the pastry in hand and the one coming next. Each new drop is a cookie, croissant, doughnut or Danish.'],
      ['Aim and drop','Tap a position on the board, or hold and drag sideways, then release. The pastry falls from that position. On a keyboard, focus the board, aim with the arrow keys and press Space or Enter. You can drop one pastry at a time, once the previous drop animation finishes.'],
      ['Merges and scoring','Two touching pastries of the same type merge into the next tier. Two cookies make a croissant for 30 points. Two croissants make a doughnut for 40. The new pastry can merge again in a chain, and each merge adds points. A drop alone scores zero. Giant egg tarts are the final tier and stay on the board when they touch.'],
      ['Game over and replay','The game ends as soon as the top of any pastry touches or crosses the red line during a drop. Reusing a seed repeats the pastry order. Your chosen drop positions determine the collisions, merges and final score. You can switch languages at any time.']
    ]
  }
};

Object.assign(copy.zh,{
  practice:'自由练习',competition:'加入比赛',roomCode:'8 位比赛房间码',find:'查找比赛',team:'小组',name:'参赛代表姓名',register:'确认小组并就绪',another:'输入其他房间码',
  enter:'输入老师投屏上的 8 位房间码。正式比赛由老师指定种子，每组使用同一套出件顺序。',chooseTeam:'每组用一台设备、一份成绩。请选择本组并填写代表姓名。',
  waiting:'已就绪，等待老师开赛',countdown:'即将开赛',officialEnd:'比赛结束',officialScore:'正式得分',submitted:'成绩已计入小组排名。',full:'本场已满或已开赛。',badCode:'未找到房间，请核对 8 位房间码。',taken:'该组已被选或比赛已开始，请重新查找。',network:'连接中断，正在重新同步。',lookupError:'未能连接比赛服务器，请检查网络并重试。',storageFail:'请允许本站保存比赛会话，然后重试。',
  strategyHeading:'用自己的 AI 策略玩',strategyCopy:'导入一个独立的 JavaScript 模块，导出 choose({board,current,next}) 并返回 0–520 的横坐标。练习与比赛使用完全相同的接口。每步限时 5 秒。',example:'下载示例策略',kit:'下载本地训练工具包',file:'选择策略文件（.js / .mjs）',auto:'让策略自动投放',loaded:'已载入',policyFail:'策略无法运行。请检查导出函数、落点或运行时间，再重新载入。',tempPolicy:'该策略仅在本次打开页面时可用。',loading:'正在载入策略…',readyPolicy:'已载入，可启用自动投放。',matchLabel:'比赛',startAdvice:'可以在棋盘旁载入自己的 AI，也可以手动投放。'
});
Object.assign(copy.en,{
  practice:'Free practice',competition:'Join competition',roomCode:'8-digit room code',find:'Find competition',team:'Team',name:'Team representative',register:'Join and mark ready',another:'Enter another room code',
  enter:'Enter the 8-digit code on the teacher’s screen. The teacher chooses the seed, and every team receives the same pastry sequence.',chooseTeam:'Use one device and one entry per team. Choose your team and enter the representative’s name.',
  waiting:'Ready · waiting for the teacher',countdown:'Starting soon',officialEnd:'Competition finished',officialScore:'Official score',submitted:'Your score is on the team leaderboard.',full:'This competition is full or already underway.',badCode:'Room not found. Check the 8-digit code.',taken:'Team already taken or round started. Look up the room again.',network:'Connection interrupted. Resynchronizing…',lookupError:'Could not reach the competition server. Check your connection and try again.',storageFail:'Allow browser storage for this site and try again.',
  strategyHeading:'Play with your own AI',strategyCopy:'Import a standalone JavaScript module exporting choose({board,current,next}). Return a horizontal position from 0 to 520. Both modes use the same interface, with five seconds per decision.',example:'Download example strategy',kit:'Download local training kit',file:'Choose a strategy file (.js / .mjs)',auto:'Let the strategy drop automatically',loaded:'Loaded',policyFail:'Strategy failed. Check the exported function, position and time limit, then reload the file.',tempPolicy:'Available for this visit only.',loading:'Loading strategy…',readyPolicy:'Loaded. You can turn on automatic drops.',matchLabel:'Competition',startAdvice:'Load your AI beside the board, or play manually.'
});

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
let savedLanguage;
try { savedLanguage = localStorage.getItem('bakehouse-test-lang'); } catch {}
const requestedLanguage = params.get('lang');
let lang = ['zh','en'].includes(requestedLanguage) ? requestedLanguage : ['zh','en'].includes(savedLanguage) ? savedLanguage : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
let mode='practice', practiceState=null, selectedRoom=null, officialState=null, officialIdentity=null, matchMessage='', matchTicket=0;
let policyMessage='', policyName='', autoBusy=false, runVersion=0, policyLoading=false;
let game = null, panel = 'welcome', move = null, aim = 260, pointer = null, animation = 0;
const W = 520, H = 680;
function validSeed(value) {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= 4294967295 ? n : null;
}
function randomSeed() {
  const word = new Uint32Array(1);
  do { crypto.getRandomValues(word); } while (!word[0]);
  return word[0];
}
function drawTier() {
  let n = game.rng;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  game.rng = n >>> 0;
  return 1 + game.rng % 4;
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
  $('seed-info').textContent = mode==='competition' ? (officialIdentity ? t.team+' '+officialIdentity.team+' · '+t.moves+' '+(game?.drops||0) : '') : game ? t.activeSeed+' '+game.seed+' · '+t.moves+' '+game.drops : '';
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
  $('practice-mode').setAttribute('aria-pressed',String(mode==='practice'));
  $('match-mode').setAttribute('aria-pressed',String(mode==='competition'));
  $('practice-setup').hidden=mode!=='practice';
  $('match-setup').hidden=mode!=='competition';
  $('overlay').classList.toggle('official',mode==='competition');
  $('overlay').hidden = !panel;
  canvas.tabIndex = panel ? -1 : 0;
  $('new-game').hidden = !!panel || mode==='competition';
  if(mode==='competition'){matchUI();return;}
  if(!panel) return;
  $('setup-heading').textContent = t[panel];
  $('setup-copy').textContent = panel === 'over' ? t.result.replace('{score}',format(game.score)).replace('{drops}',format(game.drops)) : panel === 'change' ? t.changeCopy : t.setup;
  if(panel==='over'&&Number.isFinite(game.practiceBest)){
    $('setup-copy').textContent+=' '+(lang==='zh'?'此设备该种子的最高分':'Best on this device for this seed')+' · '+format(game.practiceBest);
  }
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
  $('error').textContent=t.invalid;
  $('instructions').replaceChildren(...t.sections.flatMap(([heading,body])=>{
    const dt=document.createElement('dt'), dd=document.createElement('dd');dt.textContent=heading;dd.textContent=body;return [dt,dd];
  }));
  $('ladder').replaceChildren(...t.items.slice(1).map((name,i)=>{
    const li=document.createElement('li'), icon=document.createElement('canvas'), label=document.createElement('div'), points=document.createElement('span');
    icon.width=64;icon.height=64;icon.setAttribute('aria-hidden','true');
    pastryIcon(icon,i+1,14+i*1.7);label.textContent=(i+1)+'. '+name; points.textContent=i===0?t.starter:'+'+((i+2)*10)+' '+t.points;
    label.append(points);li.append(icon,label);return li;
  }));
  $('announcement').textContent='';
  policyUI();panelUI();dashboard();drawBoard();
}
function begin(seed) {
  cancelAnimationFrame(animation);move=null;pointer=null;aim=W/2;panel=null;
  game={seed,rng:seed,board:[],score:0,drops:0,dead:false};
  game.current=drawTier();game.next=drawTier();
  $('seed').value=String(seed);$('error').hidden=true;$('seed').removeAttribute('aria-invalid');
  runVersion++;resetPolicy();
  panelUI();dashboard();drawBoard();canvas.focus({preventScroll:true});
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
  if(move.frame>=outcome.endFrame && mode==='competition'){
    move=null;applyOfficialBoard(officialState.game);panel=game.dead?'officialEnd':null;
    panelUI();dashboard();drawBoard();return;
  }
  if(move.frame>=outcome.endFrame) {
    game.board=outcome.board; game.dead=outcome.dead;move=null;
    if(game.dead) {
      try{
        const key='bakehouse-practice-best:'+game.seed;
        const best=Math.max(Number(localStorage.getItem(key))||0,game.score);
        localStorage.setItem(key,String(best));
        game.practiceBest=best;
      }catch{}
      panel='over';$('seed').value=String(game.seed);panelUI();$('start').focus({preventScroll:true});
      $('announcement').textContent=copy[lang].over+' '+format(game.score);
    } else {
      game.current=game.next;game.next=drawTier();$('announcement').textContent=copy[lang].ready;
    }
    dashboard();
  } else { animation=requestAnimationFrame(tick); }
  drawBoard();
}
function clampAim(x) {
  const margin=(game ? RADII[game.current] : 0)+4;
  return Math.max(margin,Math.min(W-margin,x));
}
function drop(fromPolicy=false) {
  if(!fromPolicy && $('auto-play').checked)return;
  if(panel || move || !game || game.dead) return;
  const x=clampAim(aim);
  if(mode==='competition'){void client.move(x);return;}
  const outcome=simulateDrop(game.board,game.current,x);
  move={outcome,board:beginDrop(game.board,game.current,x),frame:0,start:performance.now()};
  game.drops++; dashboard();animation=requestAnimationFrame(tick);
}
function aimAt(e) { const rect=canvas.getBoundingClientRect();aim=clampAim((e.clientX-rect.left)*W/rect.width);drawBoard(); }
canvas.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||panel||move||!game||$('auto-play').checked)return;
  pointer=e.pointerId;canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});aimAt(e);
});
canvas.addEventListener('pointermove',e=>{if(!$('auto-play').checked&&!panel&&!move&&(e.pointerId===pointer||(pointer===null&&e.pointerType==='mouse')))aimAt(e);});
canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;pointer=null;aimAt(e);drop();});
for(const name of ['pointercancel','lostpointercapture']) canvas.addEventListener(name,e=>{if(pointer===e.pointerId)pointer=null;});
canvas.addEventListener('keydown',e=>{
  if(panel||move||!game||$('auto-play').checked)return;
  if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();aim=clampAim(aim+(e.key==='ArrowLeft'?-10:10));drawBoard();}
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat)drop();}
});
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{
  lang=button.dataset.lang;try{localStorage.setItem('bakehouse-test-lang',lang);}catch{}
  translate();
}));
$('shuffle').addEventListener('click',()=>{$('seed').value=String(randomSeed());$('seed').dispatchEvent(new Event('input'));});
$('seed').addEventListener('input',()=>{$('error').hidden=true;$('seed').removeAttribute('aria-invalid');});
$('setup-form').addEventListener('submit',e=>{
  e.preventDefault();const seed=validSeed($('seed').value);
  if(seed===null){$('error').hidden=false;$('seed').setAttribute('aria-invalid','true');$('seed').focus();return;}
  begin(seed);
});
$('new-game').addEventListener('click',()=>{
  if(move) { cancelAnimationFrame(animation);tick(move.start+1200); }
  if(game.dead)return;
  panel='change';$('seed').value=String(game.seed);panelUI();drawBoard();$('seed').focus({preventScroll:true});
});
$('resume').addEventListener('click',()=>{panel=null;$('error').hidden=true;$('seed').removeAttribute('aria-invalid');panelUI();drawBoard();canvas.focus({preventScroll:true});});
$('seed').value=String(validSeed(params.get('seed')||'')??randomSeed());
const strategy=new Strategy($('strategy-frame'));
const client=new TeamClient(onOfficial,e=>{showMessage(e.status===404?'badCode':'network');});
let cachedDecision=null, policyEpoch=0;
function showMessage(key){
  matchMessage=key;
  $('match-message').hidden=mode!=='competition'||!key;
  $('match-message').textContent=copy[lang][key]||'';
}
function policyUI(){
  const t=copy[lang];
  $('strategy-status').textContent=[policyName ? t.loaded+' · '+policyName : '',t[policyMessage]||''].filter(Boolean).join(' · ');
  $('auto-play').disabled=!policyName||policyLoading;
}
async function resetPolicy(){
  cachedDecision=null;const epoch=++policyEpoch;
  if(!strategy.source)return;
  policyLoading=true;policyUI();
  try{await strategy.reset();}
  catch{if(epoch===policyEpoch){policyMessage='policyFail';$('auto-play').checked=false;}}
  finally{if(epoch===policyEpoch){policyLoading=false;policyUI();}}
}
async function loadPolicy(name,source,persist){
  const epoch=++policyEpoch;
  policyLoading=true;policyMessage='loading';policyName='';cachedDecision=null;$('auto-play').checked=false;policyUI();
  try{
    const saved=await strategy.load(name,source,persist);
    if(epoch!==policyEpoch)return;
    policyName=name;policyMessage=saved?'readyPolicy':'tempPolicy';
  }catch{if(epoch===policyEpoch){policyMessage='policyFail';}}
  finally{if(epoch===policyEpoch){policyLoading=false;policyUI();}}
}
$('strategy-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  if(file.size>8*1024*1024){policyMessage='policyFail';policyUI();return;}
  await loadPolicy(file.name,await file.text(),true);e.target.value='';
});
$('auto-play').addEventListener('change',()=>{
  cachedDecision=null;
  try{localStorage.setItem('bakehouse-auto-play',$('auto-play').checked?'on':'off');}catch{}
});
async function autoTurn(){
  if(autoBusy||policyLoading||!$('auto-play').checked||!game||game.dead||panel||move)return;
  if(mode==='competition'&&(!client.state?.game||client.busy||client.now()<client.state.game.readyAt))return;
  autoBusy=true;
  const version=runVersion,epoch=policyEpoch,turn=game.drops;
  try{
    let x=cachedDecision?.version===version && cachedDecision.turn===turn ? cachedDecision.x : await strategy.choose(game);
    if(version!==runVersion||epoch!==policyEpoch||game?.drops!==turn||panel||move||!$('auto-play').checked)return;
    cachedDecision={version,turn,x};aim=clampAim(x);drop(true);
  }catch{if(version===runVersion&&epoch===policyEpoch){policyMessage='policyFail';$('auto-play').checked=false;policyUI();}}
  finally{autoBusy=false;}
}
function matchUI(){
  const t=copy[lang];
  $('room-form').hidden=panel!=='code';$('team-form').hidden=panel!=='register';
  $('switch-room').hidden=!['register','waiting','countdown','officialEnd','full','restore'].includes(panel);
  $('match-heading').textContent=t[({code:'competition',register:'team',waiting:'waiting',countdown:'countdown',officialEnd:'officialEnd',full:'competition',restore:'competition'})[panel]]||'';
  $('match-copy').textContent=panel==='code'?t.enter:panel==='register'?selectedRoom.name+' · '+t.chooseTeam:
    panel==='officialEnd'?t.officialScore+' '+format(game?.score||0)+' · '+t.submitted:
    panel==='full'?t.full:panel==='restore'?t.network:officialIdentity?t.team+' '+officialIdentity.team+' · '+officialIdentity.name+(panel==='countdown'?' · '+Math.max(1,Math.ceil((officialState.startAt-client.now())/1000)):''):'';
  if(panel==='register'){
    const el=$('team-select'), old=el.value;
    const choices=Array.from({length:selectedRoom.teamCount},(_,i)=>i+1).filter(i=>!selectedRoom.taken.includes(i));
    el.replaceChildren(...choices.map(i=>new Option(t.team+' '+i,String(i))));
    if(choices.includes(Number(old)))el.value=old;
  }
  showMessage(matchMessage);
}
function applyOfficialBoard(g){
  game={board:g.board,score:g.score,drops:g.drops,current:g.current,next:g.next,dead:g.status==='finished'};
}
function onOfficial(state,identity){
  if(mode!=='competition')return;
  officialState=state;officialIdentity=identity;showMessage('');
  if(!state.game){
    panel=state.phase==='countdown'?'countdown':'waiting';game=null;
  }else if(!move){
    const g=state.game, prev=game;
    if(!prev){runVersion++;resetPolicy();}
    applyOfficialBoard(g);panel=game.dead?'officialEnd':null;
    if(prev && g.drops===prev.drops+1 && g.lastMove?.drop===g.drops){
      const last=g.lastMove,elapsed=Math.max(0,state.serverNow-last.at);
      if(elapsed<1150){
        const after={...g,dead:g.status==='finished'};
        game.score=last.score;panel=null;
        move={outcome:{board:g.board,dead:after.dead,endFrame:last.endFrame,contactFrame:last.contactFrame},board:beginDrop(last.board,last.level,last.x),frame:0,start:performance.now()-elapsed};
        animation=requestAnimationFrame(tick);
      }
    }
  }
  panelUI();dashboard();drawBoard();
}
function saveMode(value){try{localStorage.setItem('bakehouse-student-mode',value);}catch{}}
function enterMode(nextMode){
  if(nextMode===mode)return;
  runVersion++;matchTicket++;cachedDecision=null;
  if(mode==='practice'){
    if(move){cancelAnimationFrame(animation);tick(move.start+1250);}
    practiceState={game,panel,aim};
  }else {client.stop();cancelAnimationFrame(animation);move=null;}
  mode=nextMode;saveMode(mode);pointer=null;aim=260;game=null;showMessage('');
  if(mode==='practice'){
    game=practiceState?.game||null;panel=practiceState?.panel||'welcome';aim=practiceState?.aim||260;
    officialState=officialIdentity=null;resetPolicy();
  }else{
    panel='code';
    const last=client.latest(),known=last&&client.remembered(last);
    if(known?.token){panel='restore';officialIdentity=known;client.connect(known);}
  }
  panelUI();dashboard();drawBoard();
}
$('practice-mode').onclick=()=>enterMode('practice');
$('match-mode').onclick=()=>enterMode('competition');
$('switch-room').onclick=()=>{
  matchTicket++;runVersion++;client.stop();officialState=officialIdentity=selectedRoom=null;
  panel='code';game=null;showMessage('');panelUI();dashboard();drawBoard();
};
$('room-form').onsubmit=async e=>{
  e.preventDefault();const ticket=++matchTicket,code=$('room-code').value.trim();
  if(!/^\d{8}$/.test(code)){showMessage('badCode');return;}
  const button=e.target.querySelector('button');button.disabled=true;showMessage('');
  try{
    const info=await client.lookup(code);
    if(ticket!==matchTicket)return;
    selectedRoom=info;const saved=client.remembered(code);
    if(saved?.token){officialIdentity=saved;panel='restore';client.connect(saved);}
    else if(saved?.key){
      await client.join(code,saved.team,saved.name);
    }else panel=info.phase==='lobby'&&info.taken.length<info.teamCount?'register':'full';
    panelUI();
  }catch(err){if(ticket===matchTicket)showMessage(err.status===404?'badCode':err.status===409?'taken':'lookupError');}
  finally{button.disabled=false;}
};
$('team-form').onsubmit=async e=>{
  e.preventDefault();const ticket=++matchTicket;
  const name=$('representative').value.trim(), team=Number($('team-select').value);
  if(!name||!selectedRoom||!team)return;
  const button=e.target.querySelector('button');button.disabled=true;
  try{await client.join(selectedRoom.code,team,name);}
  catch(err){
    if(ticket===matchTicket){
      if(err.status===409){panel='code';panelUI();}
      showMessage(err.status===409?'taken':err.name==='SecurityError'||err.name==='QuotaExceededError'?'storageFail':'lookupError');
    }
  }finally{button.disabled=false;}
};
const savedPolicy=strategy.saved();
if(savedPolicy?.source)void loadPolicy(savedPolicy.name,savedPolicy.source,false).then(()=>{
  try{if(policyName&&localStorage.getItem('bakehouse-auto-play')==='on')$('auto-play').checked=true;}catch{}
});
translate();
try{if(localStorage.getItem('bakehouse-student-mode')==='competition')enterMode('competition');}catch{}
setInterval(()=>{if(mode==='competition'&&panel==='countdown')matchUI();void autoTurn();},130);
