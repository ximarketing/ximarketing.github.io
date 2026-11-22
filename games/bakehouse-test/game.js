import {drawItem} from './art.js';
import {RADII, beginDrop, stepPhysics, simulateDrop, replayFrameAt} from './engine.js';

const copy = {
  zh: {
    edition:'单人测试版', title:'烘焙合成赛', rules:'游戏规则', board:'点心棋盘', score:'得分', now:'手中', next:'下一块',
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
    edition:'Solo test', title:'Bakehouse Merge', rules:'Game rules', board:'Pastry board', score:'Score', now:'In hand', next:'Up next',
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

const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
let savedLanguage;
try { savedLanguage = localStorage.getItem('bakehouse-test-lang'); } catch {}
const requestedLanguage = params.get('lang');
let lang = ['zh','en'].includes(requestedLanguage) ? requestedLanguage : ['zh','en'].includes(savedLanguage) ? savedLanguage : navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
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
  $('seed-info').textContent = game ? t.activeSeed+' '+game.seed+' · '+t.moves+' '+game.drops : '';
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
  panelUI();dashboard();drawBoard();
}
function begin(seed) {
  cancelAnimationFrame(animation);move=null;pointer=null;aim=W/2;panel=null;
  game={seed,rng:seed,board:[],score:0,drops:0,dead:false};
  game.current=drawTier();game.next=drawTier();
  $('seed').value=String(seed);$('error').hidden=true;$('seed').removeAttribute('aria-invalid');
  const url=new URL(location.href);url.searchParams.set('seed',String(seed));url.hash='';history.replaceState(null,'',url);
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
  if(move.frame>=outcome.endFrame) {
    game.board=outcome.board; game.dead=outcome.dead;move=null;
    if(game.dead) {
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
function drop() {
  if(panel || move || !game || game.dead) return;
  const x=clampAim(aim), outcome=simulateDrop(game.board,game.current,x);
  move={outcome,board:beginDrop(game.board,game.current,x),frame:0,start:performance.now()};
  game.drops++; dashboard();animation=requestAnimationFrame(tick);
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
translate();
