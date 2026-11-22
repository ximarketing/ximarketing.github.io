// Original procedural artwork from the Bakehouse game.
export const ITEMS = [
  { name: 'Crumb', radius: 16, fill: '#E8C88A', accent: '#C49A54' },
  { name: 'Cookie', radius: 22, fill: '#D4A45A', accent: '#A87A3A' },
  { name: 'Croissant', radius: 30, fill: '#D99B4A', accent: '#A06820' },
  { name: 'Donut', radius: 38, fill: '#C4853E', accent: '#8A5818' },
  { name: 'Danish', radius: 47, fill: '#B07030', accent: '#7A4818' },
  { name: 'Pretzel', radius: 57, fill: '#9A5E22', accent: '#6A3E12' },
  { name: 'Sausage Roll', radius: 68, fill: '#8A4E1A', accent: '#5A300E' },
  { name: 'Pain au Choc', radius: 80, fill: '#7A3E12', accent: '#4A2408' },
  { name: 'Sourdough', radius: 94, fill: '#6B3A10', accent: '#3A1E06' },
  { name: 'Egg Tart', radius: 110, fill: '#E8A038', accent: '#C47818' },
  { name: 'Giant Tart', radius: 135, fill: '#F0B840', accent: '#D49020' },
];
const COLORS = { bg: '#fffcf7' };
// Original procedural bakery illustrations.
export function drawItem(c, level, x, y, r, alpha) {
  if (alpha === undefined) alpha = 1;
  var item = ITEMS[level];
  if (!item) return;
  r = Math.max(2, r);
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.arc(x, y + r * 0.06, r * 0.92, 0, Math.PI * 2);
  c.fillStyle = 'rgba(92,58,30,.12)';
  c.fill();
  if (level <= 1) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = item.fill;
    c.fill();
    c.fillStyle = item.accent;
    var dots = level === 0 ? 3 : 5;
    for (var i = 0; i < dots; i++) {
      var ang = (i / dots) * Math.PI * 2,
        dr = r * 0.5;
      c.beginPath();
      c.arc(x + Math.cos(ang) * dr, y + Math.sin(ang) * dr, r * 0.12, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,.2)';
    c.fill();
  } else if (level === 2) {
    c.fillStyle = item.fill;
    c.beginPath();
    c.arc(x, y, r * 0.85, Math.PI * 0.3, Math.PI * 1.7);
    c.arc(x, y, r * 0.5, Math.PI * 1.7, Math.PI * 0.3, true);
    c.closePath();
    c.fill();
    c.strokeStyle = item.accent;
    c.lineWidth = r * 0.08;
    for (var k = -1; k <= 1; k++) {
      c.beginPath();
      c.arc(x, y, r * 0.65, Math.PI * 0.5 + k * 0.4, Math.PI * 0.5 + k * 0.4 + 0.6);
      c.stroke();
    }
  } else if (level === 3) {
    c.fillStyle = item.fill;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x, y, r * 0.32, 0, Math.PI * 2);
    c.fillStyle = COLORS.bg;
    c.fill();
    c.fillStyle = item.accent;
    c.beginPath();
    c.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2);
    c.fill();
  } else if (level === 4) {
    c.fillStyle = item.fill;
    c.beginPath();
    var s = r * 0.85;
    c.moveTo(x - s, y - s);
    c.arc(x - s, y - s, r * 0.3, Math.PI, Math.PI * 1.5);
    c.lineTo(x + s, y - s);
    c.arc(x + s, y - s, r * 0.3, Math.PI * 1.5, 0);
    c.lineTo(x + s, y + s);
    c.arc(x + s, y + s, r * 0.3, 0, Math.PI * 0.5);
    c.lineTo(x - s, y + s);
    c.arc(x - s, y + s, r * 0.3, Math.PI * 0.5, Math.PI);
    c.closePath();
    c.fill();
    c.strokeStyle = item.accent;
    c.lineWidth = r * 0.1;
    c.beginPath();
    c.arc(x, y, r * 0.3, 0, Math.PI * 1.5);
    c.stroke();
  } else if (level === 5) {
    c.strokeStyle = item.fill;
    c.lineWidth = r * 0.28;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x - r * 0.35, y - r * 0.1, r * 0.38, Math.PI * 0.8, Math.PI * 2.2);
    c.arc(x + r * 0.35, y - r * 0.1, r * 0.38, Math.PI * 0.8, Math.PI * 2.2);
    c.moveTo(x - r * 0.35, y + r * 0.15);
    c.quadraticCurveTo(x, y + r * 0.5, x + r * 0.35, y + r * 0.15);
    c.stroke();
    c.lineWidth = r * 0.16;
    c.beginPath();
    c.moveTo(x - r * 0.7, y + r * 0.3);
    c.lineTo(x + r * 0.7, y + r * 0.3);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath();
    c.arc(x - r * 0.2, y - r * 0.1, r * 0.06, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x + r * 0.15, y + r * 0.15, r * 0.06, 0, Math.PI * 2);
    c.fill();
  } else if (level === 6) {
    c.fillStyle = item.fill;
    c.beginPath();
    c.roundRect(x - r * 0.8, y - r * 0.4, r * 1.6, r * 0.8, r * 0.2);
    c.fill();
    c.fillStyle = item.accent;
    c.beginPath();
    c.arc(x - r * 0.8, y, r * 0.4, -Math.PI * 0.5, Math.PI * 0.5);
    c.arc(x + r * 0.8, y, r * 0.4, Math.PI * 0.5, Math.PI * 1.5);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,.15)';
    c.lineWidth = r * 0.04;
    for (var si = -1; si <= 1; si++) {
      c.beginPath();
      c.moveTo(x + si * r * 0.35, y - r * 0.32);
      c.lineTo(x + si * r * 0.35, y + r * 0.32);
      c.stroke();
    }
  } else if (level === 7) {
    c.fillStyle = item.fill;
    c.beginPath();
    c.roundRect(x - r * 0.8, y - r * 0.7, r * 1.6, r * 1.4, r * 0.15);
    c.fill();
    c.fillStyle = '#3A1A08';
    c.fillRect(x - r * 0.6, y - r * 0.12, r * 0.5, r * 0.24);
    c.fillRect(x + r * 0.1, y - r * 0.12, r * 0.5, r * 0.24);
    c.strokeStyle = item.accent;
    c.lineWidth = r * 0.04;
    for (var ll = 0; ll < 3; ll++) {
      c.beginPath();
      c.moveTo(x - r * 0.7 + ll * r * 0.5, y - r * 0.6);
      c.lineTo(x - r * 0.4 + ll * r * 0.5, y + r * 0.6);
      c.stroke();
    }
  } else if (level === 8) {
    c.fillStyle = item.fill;
    c.beginPath();
    c.ellipse(x, y, r * 0.95, r * 0.85, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = item.accent;
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.arc(x, y - r * 0.15, r * 0.35, Math.PI * 0.8, Math.PI * 2.2);
    c.stroke();
    c.beginPath();
    c.arc(x, y - r * 0.15, r * 0.55, Math.PI * 0.8, Math.PI * 2.2);
    c.stroke();
    c.fillStyle = 'rgba(255,250,235,.3)';
    for (var d = 0; d < 6; d++) {
      c.beginPath();
      c.arc(x + (d - 3) * r * 0.2, y + ((d % 2) - 0.5) * r * 0.3, r * 0.04, 0, Math.PI * 2);
      c.fill();
    }
  } else if (level === 9) {
    c.fillStyle = item.accent;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = item.fill;
    c.beginPath();
    c.arc(x, y, r * 0.75, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.beginPath();
    c.ellipse(x - r * 0.2, y - r * 0.25, r * 0.3, r * 0.15, -0.3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = item.accent;
    c.lineWidth = r * 0.08;
    c.beginPath();
    c.arc(x, y, r * 0.88, 0, Math.PI * 2);
    c.stroke();
  } else if (level === 10) {
    var grad = c.createRadialGradient(x, y, r * 0.3, x, y, r * 1.3);
    grad.addColorStop(0, 'rgba(240,184,64,.4)');
    grad.addColorStop(1, 'rgba(240,184,64,0)');
    c.fillStyle = grad;
    c.beginPath();
    c.arc(x, y, r * 1.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = item.accent;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = item.fill;
    c.beginPath();
    c.arc(x, y, r * 0.78, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.3)';
    c.beginPath();
    c.ellipse(x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.18, -0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#FFF';
    for (var st = 0; st < 5; st++) {
      var sa = (st / 5) * Math.PI * 2;
      drawStar(c, x + Math.cos(sa) * r * 0.5, y + Math.sin(sa) * r * 0.5, r * 0.06, r * 0.03, 4);
    }
  }
  if (level < 9) {
    c.strokeStyle = 'rgba(54,33,14,.15)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}
function drawStar(c, cx, cy, outerR, innerR, points) {
  c.beginPath();
  for (var i = 0; i < points * 2; i++) {
    var rad = i % 2 === 0 ? outerR : innerR,
      a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2,
      px = cx + Math.cos(a) * rad,
      py = cy + Math.sin(a) * rad;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fill();
}
