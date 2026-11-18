// Drawing only: the world's state and the current screen in, pixels out. The city is painted
// once to a 3200x2400 offscreen layer (roads, buildings, beach, park, signs); each frame only
// blits the visible part of it and draws what moves. The HUD and the panels are drawn in
// screen space on top.
import { BEACH, FONT, PALETTE, ROADS, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_FAILED = 'failed';
export const SCREEN_STORY = 'story';

const AVENUE_NAMES = ['Bay Ave', 'Palm Ave', 'Sunset Blvd', 'Coral Ave', 'Harbor Ave'];
const STREET_NAMES = ['Ocean Dr', 'Pier St', 'Park Ln', 'Casino Row', 'Marina Way'];

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

function prerender(city) {
  const layer = document.createElement('canvas');
  layer.width = WORLD.width;
  layer.height = WORLD.height;
  const c = layer.getContext('2d');

  // Sea and sand on the west, waterfront on the south.
  const sea = c.createLinearGradient(0, 0, 260, 0);
  sea.addColorStop(0, PALETTE.waterDeep);
  sea.addColorStop(1, PALETTE.waterShallow);
  c.fillStyle = sea;
  c.fillRect(0, 0, BEACH.waterTo, WORLD.height);
  c.fillStyle = PALETTE.sand;
  c.fillRect(BEACH.waterTo, 0, BEACH.sandTo - BEACH.waterTo, WORLD.height);
  c.fillStyle = PALETTE.sandWet;
  c.fillRect(BEACH.waterTo, 0, 26, WORLD.height);
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 3;
  for (let y = 60; y < WORLD.height; y += 170) {
    c.beginPath();
    c.arc(70, y, 42, Math.PI * 1.15, Math.PI * 1.85);
    c.stroke();
  }
  // South water with the marina basin.
  const south = c.createLinearGradient(0, 2280, 0, 2400);
  south.addColorStop(0, PALETTE.waterShallow);
  south.addColorStop(1, PALETTE.waterDeep);
  c.fillStyle = south;
  c.fillRect(0, 2280, WORLD.width, 120);
  c.fillStyle = PALETTE.waterDeep;
  c.fillRect(city.marina.x0, city.marina.y0, city.marina.x1 - city.marina.x0, 120);
  c.strokeStyle = PALETTE.sand;
  c.lineWidth = 6;
  c.strokeRect(city.marina.x0, city.marina.y0, city.marina.x1 - city.marina.x0, 120);
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.lineWidth = 2;
  for (let wy = city.marina.y0 + 26; wy < city.marina.y0 + 110; wy += 30) {
    c.beginPath();
    c.arc(city.marina.x0 + 60, wy, 26, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.beginPath();
    c.arc(city.marina.x0 + 300, wy + 12, 30, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
  }

  // Land base, then a sidewalk ring and a pavement core per block.
  c.fillStyle = '#8f8871';
  c.fillRect(BEACH.sandTo, 0, WORLD.width - BEACH.sandTo, 2280);
  for (const block of city.blocks) {
    if (block.kind === 'park') {
      c.fillStyle = PALETTE.grass;
      c.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      c.fillStyle = PALETTE.parkPath;
      c.fillRect(block.x0, block.y0 + (block.y1 - block.y0) / 2 - 10, block.x1 - block.x0, 20);
      c.fillRect(block.x0 + (block.x1 - block.x0) / 2 - 10, block.y0, 20, block.y1 - block.y0);
      c.fillStyle = PALETTE.pond;
      c.beginPath();
      c.ellipse(block.pond.x + block.pond.w / 2, block.pond.y + block.pond.h / 2, block.pond.w / 2, block.pond.h / 2, 0, 0, Math.PI * 2);
      c.fill();
    } else if (block.kind === 'plaza') {
      c.fillStyle = PALETTE.plaza;
      c.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      c.fillStyle = PALETTE.pond;
      c.beginPath();
      c.arc(block.fountain.x, block.fountain.y, block.fountain.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#d9ecf2';
      c.beginPath();
      c.arc(block.fountain.x, block.fountain.y, block.fountain.r - 12, 0, Math.PI * 2);
      c.fill();
    } else if (block.kind === 'parking') {
      c.fillStyle = '#4a4d55';
      c.fillRect(block.x0 + 14, block.y0 + 14, block.x1 - block.x0 - 28, block.y1 - block.y0 - 28);
      c.strokeStyle = 'rgba(232,228,216,0.7)';
      c.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const x = block.x0 + 60 + (i % 3) * 130;
        const y = block.y0 + 70 + Math.floor(i / 3) * 110;
        c.strokeRect(x - 24, y - 46, 48, 92);
      }
    } else if (block.kind === 'promenade' || block.kind === 'marina') {
      c.fillStyle = '#cbbd9c';
      c.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
    } else if (block.kind === 'beachfront') {
      c.fillStyle = PALETTE.sand;
      c.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
    } else {
      c.fillStyle = PALETTE.sidewalk;
      c.fillRect(block.x0, block.y0, block.x1 - block.x0, block.y1 - block.y0);
      c.fillStyle = PALETTE.block;
      c.fillRect(block.x0 + 14, block.y0 + 14, block.x1 - block.x0 - 28, block.y1 - block.y0 - 28);
    }
  }

  // Roads: asphalt, edge lines, centre dashes, crosswalks at every intersection.
  c.fillStyle = PALETTE.road;
  for (const x of ROADS.avenues) c.fillRect(x - ROADS.avenueWidth / 2, 0, ROADS.avenueWidth, 2280);
  for (const y of ROADS.streets) c.fillRect(BEACH.sandTo, y - ROADS.streetWidth / 2, WORLD.width - BEACH.sandTo, ROADS.streetWidth);
  c.strokeStyle = PALETTE.roadEdge;
  c.lineWidth = 3;
  for (const x of ROADS.avenues) {
    c.beginPath(); c.moveTo(x - ROADS.avenueWidth / 2, 0); c.lineTo(x - ROADS.avenueWidth / 2, 2280); c.stroke();
    c.beginPath(); c.moveTo(x + ROADS.avenueWidth / 2, 0); c.lineTo(x + ROADS.avenueWidth / 2, 2280); c.stroke();
  }
  for (const y of ROADS.streets) {
    c.beginPath(); c.moveTo(BEACH.sandTo, y - ROADS.streetWidth / 2); c.lineTo(WORLD.width, y - ROADS.streetWidth / 2); c.stroke();
    c.beginPath(); c.moveTo(BEACH.sandTo, y + ROADS.streetWidth / 2); c.lineTo(WORLD.width, y + ROADS.streetWidth / 2); c.stroke();
  }
  c.fillStyle = PALETTE.roadDash;
  for (const x of ROADS.avenues) {
    for (let y = 20; y < 2280; y += 64) c.fillRect(x - 3, y, 6, 30);
  }
  for (const y of ROADS.streets) {
    for (let x = BEACH.sandTo + 20; x < WORLD.width; x += 64) c.fillRect(x, y - 3, 30, 6);
  }
  c.fillStyle = PALETTE.crosswalk;
  for (const x of ROADS.avenues) {
    for (const y of ROADS.streets) {
      for (let i = -3; i <= 3; i += 1) {
        c.fillRect(x + i * 13 - 4, y - ROADS.streetWidth / 2 + 6, 8, 16);
        c.fillRect(x + i * 13 - 4, y + ROADS.streetWidth / 2 - 22, 8, 16);
      }
    }
  }
  // Street names, along the roads.
  c.fillStyle = 'rgba(232,228,216,0.55)';
  c.font = `600 22px ${FONT}`;
  c.textAlign = 'center';
  ROADS.avenues.forEach((x, i) => {
    c.save();
    c.translate(x + 34, 1140);
    c.rotate(Math.PI / 2);
    c.fillText(AVENUE_NAMES[i], 0, 0);
    c.restore();
  });
  ROADS.streets.forEach((y, i) => {
    c.fillText(STREET_NAMES[i], 1560, y - 30);
  });

  // The pier: planks out into the sea.
  const pier = city.pier;
  c.fillStyle = '#8a6b48';
  c.fillRect(pier.x0, pier.y0, pier.x1 - pier.x0, pier.y1 - pier.y0);
  c.strokeStyle = '#6b4f33';
  c.lineWidth = 2;
  for (let x = pier.x0 + 12; x < pier.x1; x += 16) {
    c.beginPath(); c.moveTo(x, pier.y0); c.lineTo(x, pier.y1); c.stroke();
  }
  c.fillStyle = '#5d4a2f';
  for (let x = pier.x0 + 20; x < pier.x1; x += 60) {
    c.fillRect(x, pier.y0 - 6, 8, 10);
    c.fillRect(x, pier.y1 - 4, 8, 10);
  }

  // Marina boats.
  c.fillStyle = '#f2efe6';
  for (let i = 0; i < 4; i += 1) {
    const bx = city.marina.x0 + 40 + i * 90;
    const by = city.marina.y0 + 40 + (i % 2) * 44;
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(bx + 54, by);
    c.lineTo(bx + 44, by + 18);
    c.lineTo(bx + 10, by + 18);
    c.closePath();
    c.fill();
    c.strokeStyle = '#5d4a2f';
    c.beginPath(); c.moveTo(bx + 27, by); c.lineTo(bx + 27, by - 26); c.stroke();
  }

  // Buildings: shadow, body, roof detail, windows on tall ones, a sign on named ones.
  const SIGNS = { casino: 'GRAND BAY', garage: "RICO'S", warehouse: 'WAREHOUSE', paint: 'PAINT', hospital: 'HOSPITAL' };
  for (const b of city.buildings) {
    c.fillStyle = 'rgba(20, 20, 30, 0.28)';
    c.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    c.fillStyle = b.color;
    c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = shade(b.color, 26);
    c.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    c.strokeStyle = shade(b.color, -42);
    c.lineWidth = 3;
    c.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
    c.fillStyle = b.tall ? 'rgba(40, 50, 70, 0.55)' : 'rgba(40, 50, 70, 0.32)';
    for (let wx = b.x + 18; wx < b.x + b.w - 16; wx += 26) {
      for (let wy = b.y + 18; wy < b.y + b.h - 16; wy += 26) {
        c.fillRect(wx, wy, 13, 15);
      }
    }
    if (b.sign && SIGNS[b.sign]) {
      c.fillStyle = '#2b2e33';
      c.font = `700 ${Math.min(30, Math.floor(b.w / (SIGNS[b.sign].length * 0.62)))}px ${FONT}`;
      c.textAlign = 'center';
      c.fillText(SIGNS[b.sign], b.x + b.w / 2, b.y + b.h / 2 + 8);
    }
  }

  // Trees and palms.
  for (const t of city.trees) {
    c.fillStyle = 'rgba(20, 20, 30, 0.2)';
    c.beginPath(); c.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = t.color;
    c.beginPath(); c.arc(t.x, t.y, t.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = shade(t.color, 30);
    c.beginPath(); c.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2); c.fill();
  }
  for (const p of city.palms) {
    c.strokeStyle = '#7a5a34';
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(p.x, p.y + 12); c.lineTo(p.x, p.y - 8); c.stroke();
    c.strokeStyle = PALETTE.palm;
    c.lineWidth = 3;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      c.beginPath();
      c.moveTo(p.x, p.y - 8);
      c.quadraticCurveTo(p.x + Math.cos(a) * 12, p.y - 8 + Math.sin(a) * 12 - 6, p.x + Math.cos(a) * 18, p.y - 8 + Math.sin(a) * 18 + 4);
      c.stroke();
    }
  }
  // Beach umbrellas.
  const umbrellaColors = ['#e5534b', '#f2c94c', '#3d7ab8', '#d97a9a'];
  for (let i = 0; i < 10; i += 1) {
    const ux = 165 + (i % 5) * 18;
    const uy = 420 + Math.floor(i / 5) * 900 + (i % 3) * 40;
    c.fillStyle = umbrellaColors[i % umbrellaColors.length];
    c.beginPath(); c.arc(ux, uy, 16, Math.PI, 0); c.fill();
    c.strokeStyle = '#5d4a2f';
    c.beginPath(); c.moveTo(ux, uy); c.lineTo(ux, uy + 14); c.stroke();
  }
  return layer;
}

export function createRenderer(canvas, city) {
  const ctx = canvas.getContext('2d');
  const layer = prerender(city);
  const view = { scale: 1, x: 0, y: 0, w: 0, h: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.w = canvas.width;
    view.h = canvas.height;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(car, isPlayer) {
    const len = car.type === 'truck' ? 58 : 46;
    const wid = car.type === 'truck' ? 24 : 22;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(20, 20, 30, 0.3)';
    ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    // Wheels.
    ctx.fillStyle = '#17191d';
    ctx.fillRect(-len / 2 + 4, -wid / 2 - 3, 10, 5);
    ctx.fillRect(len / 2 - 14, -wid / 2 - 3, 10, 5);
    ctx.fillRect(-len / 2 + 4, wid / 2 - 2, 10, 5);
    ctx.fillRect(len / 2 - 14, wid / 2 - 2, 10, 5);
    // Body.
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
    if (car.type === 'police') {
      ctx.fillStyle = '#24365e';
      ctx.fillRect(-8, -wid / 2, 16, wid);
      const flash = Math.floor(performance.now() / 280) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.fillRect(-4, -wid / 2 - 4, 7, 5);
      ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      ctx.fillRect(3, -wid / 2 - 4, 7, 5);
    } else if (car.type === 'taxi') {
      ctx.fillStyle = '#2b2e33';
      ctx.font = `700 9px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    if (car.type === 'truck') {
      ctx.fillStyle = '#e8e6df';
      ctx.fillRect(-len / 2 + 4, -wid / 2 + 3, 18, wid - 6);
    }
    // Windshield and roof.
    ctx.fillStyle = 'rgba(30, 42, 56, 0.85)';
    ctx.fillRect(len / 2 - 16, -wid / 2 + 3, 8, wid - 6);
    ctx.fillStyle = shade(car.color, -28);
    ctx.fillRect(-6, -wid / 2 + 4, 14, wid - 8);
    // Headlights and brake lights.
    ctx.fillStyle = car.brake ? '#ff3b30' : '#ffd23d';
    ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 4);
    ctx.fillRect(-len / 2, wid / 2 - 7, 3, 4);
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 3, 3, 4);
    ctx.fillRect(len / 2 - 2, wid / 2 - 7, 3, 4);
    if (car.aurora) {
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -wid / 2, len, wid, 6);
      ctx.stroke();
    }
    ctx.restore();
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(car.x, car.y, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPerson(x, y, angle, shirt, pants, walkPhase, scale = 1, down = 0) {
    ctx.save();
    ctx.translate(x, y);
    if (down > 0) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(20, 20, 30, 0.25)';
      ctx.beginPath(); ctx.ellipse(2, 3, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath(); ctx.arc(15, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(walkPhase) * 2 * scale;
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(20, 20, 30, 0.25)';
    ctx.beginPath(); ctx.ellipse(0, 3, 11 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill();
    // Legs (two dots stepping), body, head.
    ctx.fillStyle = pants;
    ctx.beginPath(); ctx.arc(-6 * scale, bob * 0.7, 3.4 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-6 * scale, -bob * 0.7, 3.4 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.arc(0, 0, 8.5 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath(); ctx.arc(9 * scale, 0, 5.5 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawWorld(state) {
    const cam = state.camera;
    const scale = cam.zoom;
    const shake = cam.trauma * cam.trauma * 16;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    const ox = view.w / 2 - cam.x * scale + sx;
    const oy = view.h / 2 - cam.y * scale + sy;
    view.scale = scale;
    view.ox = ox;
    view.oy = oy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    // Only the visible slice of the city layer.
    const vx0 = Math.max(0, (0 - ox) / scale);
    const vy0 = Math.max(0, (0 - oy) / scale);
    const vx1 = Math.min(WORLD.width, (view.w - ox) / scale);
    const vy1 = Math.min(WORLD.height, (view.h - oy) / scale);
    if (vx1 > vx0 && vy1 > vy0) {
      ctx.drawImage(layer, vx0, vy0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
    for (const pk of state.pickups) {
      circle(pk.x, pk.y + 4, 12, 'rgba(20,20,30,0.25)');
      ctx.fillStyle = '#3f7a34';
      ctx.beginPath();
      ctx.roundRect(pk.x - 10, pk.y - 12, 20, 18, 4);
      ctx.fill();
      text('$', pk.x, pk.y + 2, 15, '#8fd97a', 'center', '700');
    }
    for (const ped of state.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.pants, ped.walkPhase, 1, ped.down);
    }
    for (const t of state.thugs) {
      if (t.health <= 0 && t.down === 0) continue;
      drawPerson(t.x, t.y, t.angle, '#8a2f2f', '#2b2e33', t.walkPhase, 1.12, t.down);
      if (t.health > 0) {
        ctx.fillStyle = '#e5534b';
        ctx.fillRect(t.x - 14, t.y - 26, 28 * Math.max(0, t.health / 60), 4);
      }
    }
    for (const cop of state.police.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#24365e', '#1a2436', cop.walkPhase, 1.05, 0);
    }
    for (const car of state.cars) drawCar(car, car === state.player.car);
    const player = state.player;
    if (!player.car) {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, '#2b3a55', player.walkPhase, 1.15, 0);
      // A white ring marks the player on foot, so he never blends in with the crowd.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 21, 0, Math.PI * 2);
      ctx.stroke();
      if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) {
        ctx.strokeStyle = 'rgba(229, 83, 75, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const b of state.bullets) {
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const p of state.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - a) * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = a;
        circle(p.x, p.y, p.size, p.color);
        ctx.globalAlpha = 1;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function toScreen(x, y) {
    return { x: x * view.scale + view.ox, y: y * view.scale + view.oy };
  }

  function drawMinimap(state, hs) {
    const mmW = 200 * hs;
    const mmH = 150 * hs;
    const mx = view.w - mmW - 16 * hs;
    const my = view.h - mmH - 16 * hs;
    const sx = mmW / WORLD.width;
    const sy = mmH / WORLD.height;
    ctx.save();
    ctx.translate(mx, my);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, mmW, mmH);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, 0, BEACH.sandTo * sx, mmH);
    ctx.fillStyle = '#5d6b52';
    ctx.fillRect(0, 0, mmW, mmH);
    ctx.fillStyle = '#3a3f4a';
    for (const x of ROADS.avenues) ctx.fillRect(x * sx - 2, 0, 5, mmH);
    for (const y of ROADS.streets) ctx.fillRect(0, y * sy - 2, mmW, 5);
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(1048 * sx, 844 * sy, (1552 - 1048) * sx, (1206 - 844) * sy);
    const obj = state.missions.objective(state.player.x, state.player.y);
    if (obj && obj.target) {
      const pulse = 5 + Math.sin(performance.now() / 240) * 2;
      ctx.strokeStyle = PALETTE.waypoint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(obj.target.x * sx, obj.target.y * sy, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.waypoint;
      ctx.beginPath();
      ctx.arc(obj.target.x * sx, obj.target.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c9c9c9';
    for (const car of state.cars) ctx.fillRect(car.x * sx - 1, car.y * sy - 1, 2, 2);
    ctx.fillStyle = '#ff5a4d';
    for (const t of state.thugs) {
      if (t.health > 0) ctx.fillRect(t.x * sx - 1.5, t.y * sy - 1.5, 3, 3);
    }
    ctx.fillStyle = '#4d8dff';
    for (const cop of state.police.cops) ctx.fillRect(cop.x * sx - 1.5, cop.y * sy - 1.5, 3, 3);
    for (const car of state.police.copCars) ctx.fillRect(car.x * sx - 1.5, car.y * sy - 1.5, 3, 3);
    const p = state.player;
    ctx.save();
    ctx.translate(p.x * sx, p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(245, 239, 226, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mmW, mmH);
  }

  function drawHud(state, info) {
    const hs = Math.max(0.7, Math.min(1.3, Math.min(view.w / 1280, view.h / 720)));
    const player = state.player;
    const police = state.police;
    ctx.save();
    ctx.scale(hs, hs);
    const W = view.w / hs;
    const H = view.h / hs;
    // Top-left: cash, health, weapon.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath(); ctx.roundRect(14, 14, 210, 84, 10); ctx.fill();
    text(`$${player.cash.toLocaleString('en-US')}`, 28, 46, 28, PALETTE.cash, 'left', '700');
    ctx.fillStyle = '#2b2e33';
    ctx.beginPath(); ctx.roundRect(28, 60, 170, 14, 7); ctx.fill();
    ctx.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.healthLow;
    ctx.beginPath(); ctx.roundRect(28, 60, 170 * Math.max(0, player.health / 100), 14, 7); ctx.fill();
    text(player.weapon === 'pistol' ? 'Pistol — F / click to shoot' : 'Fists — Space to punch', 28, 92, 14, PALETTE.hudMuted);
    // Top-right: wanted stars.
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath(); ctx.roundRect(W - 224, 14, 210, 52, 10); ctx.fill();
    const pulse = police.wanted >= 3 ? 0.75 + Math.sin(performance.now() / 200) * 0.25 : 1;
    for (let i = 0; i < 5; i += 1) {
      ctx.globalAlpha = i < police.wanted ? pulse : 0.35;
      text('★', W - 206 + i * 38, 52, 30, i < police.wanted ? PALETTE.star : '#8b93a3', 'left', '700');
    }
    ctx.globalAlpha = 1;
    // Top-centre: mission objective.
    const obj = state.missions.objective(player.x, player.y);
    if (obj) {
      const cardW = 470;
      const cx = (W - cardW) / 2;
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.beginPath(); ctx.roundRect(cx, 14, cardW, 76, 10); ctx.fill();
      ctx.fillStyle = PALETTE.accent;
      ctx.fillRect(cx, 14, 5, 76);
      text(`${obj.contact} — ${obj.title}`, cx + 18, 40, 17, PALETTE.accent, 'left', '700');
      text(obj.text, cx + 18, 64, 16, PALETTE.hudText);
      let right = '';
      if (obj.timer !== null) right = `${Math.ceil(obj.timer)}s`;
      else if (obj.progress) right = obj.progress;
      else if (obj.distance !== undefined) right = `${obj.distance} m`;
      text(right, cx + cardW - 16, 64, 17, obj.timer !== null && obj.timer < 15 ? PALETTE.healthLow : PALETTE.hudMuted, 'right', '700');
    }
    // Announce line under the objective card.
    if (info.announce) {
      ctx.globalAlpha = Math.max(0, Math.min(1, info.announceTimer));
      text(info.announce, W / 2, 116, 17, PALETTE.hudText, 'center', '600');
      ctx.globalAlpha = 1;
    }
    // Toast: mission complete banner.
    if (info.toast) {
      ctx.globalAlpha = Math.max(0, Math.min(1, info.toastTimer));
      ctx.fillStyle = 'rgba(20, 28, 20, 0.85)';
      ctx.beginPath(); ctx.roundRect(W / 2 - 210, H / 2 - 150, 420, 62, 12); ctx.fill();
      text(info.toast, W / 2, H / 2 - 110, 26, PALETTE.cash, 'center', '700');
      ctx.globalAlpha = 1;
    }
    // Bottom-left: contextual hint.
    if (info.hint) {
      ctx.fillStyle = PALETTE.hudPanel;
      const hintW = 14 + info.hint.length * 7.4;
      ctx.beginPath(); ctx.roundRect(14, H - 48, hintW, 34, 8); ctx.fill();
      text(info.hint, 26, H - 25, 15, PALETTE.hudText);
    }
    // Bottom-centre: speed while driving, on a pill so it reads over any street.
    if (player.car) {
      const label = `${Math.round(Math.abs(player.car.speed) * 0.36)} km/h`;
      ctx.fillStyle = PALETTE.hudPanel;
      ctx.beginPath(); ctx.roundRect(W / 2 - 58, H - 48, 116, 32, 8); ctx.fill();
      text(label, W / 2, H - 25, 20, PALETTE.hudText, 'center', '700');
    }
    ctx.restore();
    drawMinimap(state, hs);
    // Waypoint arrow at the screen edge when the target is off-screen.
    if (obj && obj.target) {
      const sp = toScreen(obj.target.x, obj.target.y);
      const m = 46;
      if (sp.x < m || sp.x > view.w - m || sp.y < m || sp.y > view.h - m) {
        const cx = Math.max(m, Math.min(view.w - m, sp.x));
        // Keep clear of the top HUD panels.
        const cy = Math.max(116, Math.min(view.h - m, sp.y));
        const ang = Math.atan2(sp.y - cy, sp.x - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = PALETTE.waypoint;
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        const label = `${obj.distance} m`;
        ctx.fillStyle = PALETTE.hudPanel;
        ctx.beginPath(); ctx.roundRect(cx - 40, cy + 18, 80, 26, 8); ctx.fill();
        text(label, cx, cy + 36, 15, PALETTE.waypoint, 'center', '700');
      }
    }
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const hs = Math.max(0.7, Math.min(1.3, Math.min(view.w / 1280, view.h / 720)));
    const W = view.w / hs;
    const H = view.h / hs;
    ctx.save();
    ctx.scale(hs, hs);
    const width = 640;
    const height = 120 + lines.length * 32 + 64;
    const x = (W - width) / 2;
    const y = (H - height) / 2;
    ctx.fillStyle = 'rgba(12, 16, 24, 0.82)';
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 14); ctx.stroke();
    text(title, W / 2, y + 72, 46, titleColor, 'center', '800');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], W / 2, y + 122 + i * 32, 20, PALETTE.hudMuted, 'center');
    }
    text(prompt, W / 2, y + height - 30, 22, PALETTE.accent, 'center', '700');
    ctx.restore();
  }

  function drawTitle(state, info) {
    const hs = Math.max(0.7, Math.min(1.3, Math.min(view.w / 1280, view.h / 720)));
    const W = view.w / hs;
    const H = view.h / hs;
    ctx.save();
    ctx.scale(hs, hs);
    ctx.fillStyle = 'rgba(10, 14, 22, 0.45)';
    ctx.fillRect(0, 0, W, H);
    text('SUNSET BAY', W / 2, H / 2 - 150, 84, PALETTE.accent, 'center', '800');
    text('An open-world crime story', W / 2, H / 2 - 108, 26, PALETTE.hudText, 'center');
    text('New in town, broke, and already on Rico\'s list. Steal cars, run jobs,', W / 2, H / 2 - 62, 19, PALETTE.hudMuted, 'center');
    text('and take the gold Aurora from the Grand Bay Casino.', W / 2, H / 2 - 36, 19, PALETTE.hudMuted, 'center');
    const controls = [
      'WASD / Arrows — Walk & drive    ·    E — Steal / get out of a car',
      'Space — Punch    ·    F / Click — Shoot (once Lena lends you her pistol)',
      'Shift — Sprint    ·    P — Pause    ·    M — Mute',
    ];
    for (let i = 0; i < controls.length; i += 1) {
      text(controls[i], W / 2, H / 2 + 6 + i * 28, 18, PALETTE.hudText, 'center');
    }
    if (info.hasSave) {
      text(`Continue — Mission ${info.saveMission + 1} · $${info.saveCash.toLocaleString('en-US')}  (press C)`, W / 2, H / 2 + 108, 21, PALETTE.cash, 'center', '700');
      text('Press Space — New game', W / 2, H / 2 + 142, 21, PALETTE.accent, 'center', '700');
    } else {
      text('Press Space or click — New game', W / 2, H / 2 + 120, 22, PALETTE.accent, 'center', '700');
    }
    if (info.best > 0) text(`Best cash: $${info.best.toLocaleString('en-US')}`, W / 2, H / 2 + 176, 16, PALETTE.hudMuted, 'center');
    ctx.restore();
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, info) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, info);
      return;
    }
    drawHud(state, info);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.', 'WASD — Move · E — Car · Space — Punch · F — Shoot'], 'Press P to resume', PALETTE.hudText);
    } else if (screen === SCREEN_OVER) {
      const busted = info.overKind === 'busted';
      drawPanel(
        busted ? 'BUSTED' : 'WASTED',
        busted ? ['The Sunset Bay PD caught up with you.', `They took 15% of your cash as a fine.`] : ['Sunset Bay chewed you up.', 'The ambulance dropped you at Sunset General.'],
        'Press Space — Back on the street',
        busted ? '#4d8dff' : PALETTE.healthLow,
      );
    } else if (screen === SCREEN_FAILED) {
      drawPanel('Mission Failed', [info.failReason || 'The job fell through.', 'Rico is not happy.'], 'Press Space — Try the mission again', PALETTE.healthLow);
    } else if (screen === SCREEN_STORY) {
      drawPanel(
        'STORY COMPLETE',
        [`All four jobs done. The Aurora is yours, and Sunset Bay is yours too.`, `Cash: $${state.player.cash.toLocaleString('en-US')} — the city stays open. Free roam!`],
        'Press Space — Keep playing',
        PALETTE.cash,
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
