// Bakehouse v1. A standalone JavaScript module used in practice and competition.
// board: [{l, r, x, y, vx, vy}, ...]. current and next: pastry levels 1..10.
// Board size 520 × 680. Return a horizontal drop position from 0 to 520.
export function choose({board, current, next}) {
  const matches=board.filter(p=>p.l===current);
  if(matches.length) return matches.reduce((a,b)=>a.y<b.y?a:b).x;
  const lanes=[80,170,260,350,440];
  function height(x){
    return board.reduce((top,p)=>Math.abs(p.x-x)<p.r+18?Math.min(top,p.y-p.r):top,680);
  }
  return lanes.reduce((best,x)=>height(x)>height(best)?x:best);
}
