// The city itself: Sunset Bay, a coastal grid with a beach on the west and a waterfront
// promenade on the south. This file only builds data (roads, blocks, buildings, the road graph
// traffic and pedestrians walk, and every named place the story uses). Drawing lives in
// render.js; rules and movement live in world.js.
import { BEACH, PALETTE, ROADS, WORLD } from './config.js';

const BUILDING_COLORS = PALETTE.building;

/** Land between roads: spans from one road's edge to the next road's edge. */
function landSpans(centers, width, start, end) {
  const spans = [];
  let edge = start;
  for (const c of centers) {
    spans.push([edge, c - width / 2]);
    edge = c + width / 2;
  }
  spans.push([edge, end]);
  return spans;
}

/** A block is the land between roads; `kind` decides what is built on it. */
function blocks() {
  const xs = landSpans(ROADS.avenues, ROADS.avenueWidth, BEACH.sandTo, WORLD.width);
  const ys = landSpans(ROADS.streets, ROADS.streetWidth, 0, 2280);
  const list = [];
  for (let c = 0; c < xs.length; c += 1) {
    for (let r = 0; r < ys.length; r += 1) {
      list.push({ x0: xs[c][0], y0: ys[r][0], x1: xs[c][1], y1: ys[r][1], col: c, row: r, kind: 'buildings' });
    }
  }
  return list;
}

function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

export function createCity(random) {
  const allBlocks = blocks();
  const byId = (col, row) => allBlocks.find((b) => b.col === col && b.row === row);

  // Named places: the story's anchors. The park, plaza, casino, marina and promenade are
  // special blocks; the rest hold buildings, trees or parking.
  byId(2, 2).kind = 'park';
  byId(3, 2).kind = 'plaza';
  byId(3, 1).kind = 'casino';
  byId(1, 0).kind = 'garage';
  byId(4, 0).kind = 'warehouse';
  byId(4, 4).kind = 'paint';
  byId(1, 4).kind = 'hospital';
  byId(0, 2).kind = 'beachfront';
  byId(0, 4).kind = 'beachfront';
  byId(2, 5).kind = 'promenade';
  byId(3, 5).kind = 'marina';
  byId(1, 5).kind = 'promenade';
  byId(4, 5).kind = 'promenade';
  byId(0, 5).kind = 'beachfront';
  byId(0, 0).kind = 'beachfront';
  byId(0, 1).kind = 'beachfront';
  byId(0, 3).kind = 'beachfront';
  byId(2, 0).kind = 'parking';
  byId(4, 2).kind = 'parking';

  const buildings = [];
  const trees = [];
  const palms = [];
  const parkedSpots = [];
  for (const block of allBlocks) {
    const w = block.x1 - block.x0;
    const h = block.y1 - block.y0;
    if (block.kind === 'park') {
      block.pond = { x: block.x0 + w * 0.3, y: block.y0 + h * 0.3, w: w * 0.4, h: h * 0.36 };
      for (let i = 0; i < 14; i += 1) {
        trees.push({ x: block.x0 + 30 + random() * (w - 60), y: block.y0 + 30 + random() * (h - 60), r: 12 + random() * 8, color: pick(random, PALETTE.tree) });
      }
      continue;
    }
    if (block.kind === 'plaza') {
      block.fountain = { x: block.x0 + w / 2, y: block.y0 + h / 2, r: 34 };
      for (let i = 0; i < 8; i += 1) {
        trees.push({ x: block.x0 + 26 + random() * (w - 52), y: block.y0 + 26 + random() * (h - 52), r: 10 + random() * 7, color: pick(random, PALETTE.tree) });
      }
      continue;
    }
    if (block.kind === 'casino' || block.kind === 'garage' || block.kind === 'warehouse' || block.kind === 'paint' || block.kind === 'hospital') {
      const bw = w * 0.62;
      const bh = h * 0.58;
      buildings.push({
        x: block.x0 + (w - bw) / 2, y: block.y0 + (h - bh) / 2, w: bw, h: bh,
        color: block.kind === 'casino' ? '#c9a227' : pick(random, BUILDING_COLORS),
        tall: block.kind === 'casino', sign: block.kind,
      });
      continue;
    }
    if (block.kind === 'parking') {
      for (let i = 0; i < 6; i += 1) {
        parkedSpots.push({ x: block.x0 + 60 + (i % 3) * 130, y: block.y0 + 70 + Math.floor(i / 3) * 110, angle: 0 });
      }
      for (let i = 0; i < 4; i += 1) {
        trees.push({ x: block.x0 + 24 + random() * (w - 48), y: block.y0 + 24 + random() * (h - 48), r: 10 + random() * 6, color: pick(random, PALETTE.tree) });
      }
      continue;
    }
    if (block.kind === 'promenade' || block.kind === 'marina' || block.kind === 'beachfront') {
      for (let x = block.x0 + 40; x < block.x1 - 20; x += 90) {
        palms.push({ x, y: block.y0 + 34 + random() * 10, r: 9 });
      }
      if (block.kind === 'beachfront') {
        buildings.push({ x: block.x0 + 34, y: block.y0 + 70, w: w - 68, h: h * 0.42, color: pick(random, BUILDING_COLORS), tall: false, sign: null });
      }
      continue;
    }
    // Ordinary block: one to three buildings with breathing room around them.
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i += 1) {
      const bw = 110 + random() * 130;
      const bh = 90 + random() * 110;
      const bx = block.x0 + 26 + random() * Math.max(1, w - bw - 52);
      const by = block.y0 + 26 + random() * Math.max(1, h - bh - 52);
      const fresh = { x: bx, y: by, w: bw, h: bh, color: pick(random, BUILDING_COLORS), tall: random() < 0.3, sign: null };
      if (buildings.some((b) => fresh.x < b.x + b.w + 18 && fresh.x + fresh.w + 18 > b.x && fresh.y < b.y + b.h + 18 && fresh.y + fresh.h + 18 > b.y)) continue;
      buildings.push(fresh);
    }
    if (random() < 0.7) {
      trees.push({ x: block.x0 + 24 + random() * (w - 48), y: block.y0 + 24 + random() * (h - 48), r: 10 + random() * 7, color: pick(random, PALETTE.tree) });
    }
  }

  // The road graph: intersections are nodes, roads between neighbours are edges. Traffic and
  // pedestrians travel on it, so nobody ever walks through a building.
  const nodes = [];
  const nodeAt = {};
  for (const ax of ROADS.avenues) {
    for (const sy of ROADS.streets) {
      nodeAt[`${ax},${sy}`] = nodes.length;
      nodes.push({ x: ax, y: sy, links: [] });
    }
  }
  const link = (a, b) => {
    nodes[a].links.push(b);
    nodes[b].links.push(a);
  };
  for (let a = 0; a < ROADS.avenues.length; a += 1) {
    for (let s = 0; s < ROADS.streets.length; s += 1) {
      const id = nodeAt[`${ROADS.avenues[a]},${ROADS.streets[s]}`];
      if (a + 1 < ROADS.avenues.length) link(id, nodeAt[`${ROADS.avenues[a + 1]},${ROADS.streets[s]}`]);
      if (s + 1 < ROADS.streets.length) link(id, nodeAt[`${ROADS.avenues[a]},${ROADS.streets[s + 1]}`]);
    }
  }

  // The pier juts into the sea from the beach at the west edge.
  const pier = { x0: 30, y0: 1760, x1: BEACH.sandTo, y1: 1840 };
  const marina = { x0: 1500, y0: 2280, x1: 1900, y1: 2400 };

  const locations = {
    garage: { x: 700, y: 330, label: "Rico's Garage" },
    paint: { x: 2500, y: 2100, label: 'Sunset Paint & Body' },
    warehouse: { x: 2500, y: 330, label: 'Harbor Warehouse' },
    marinaDrop: { x: 1700, y: 2220, label: 'Marina Dock' },
    pierEnd: { x: 110, y: 1800, label: 'Sunset Pier' },
    casino: { x: 1900, y: 575, label: 'Grand Bay Casino' },
    auroraSpot: { x: 1900, y: 830, label: 'The Aurora' },
    hideout: { x: 330, y: 2180, label: 'Beach House' },
    hospital: { x: 700, y: 1900, label: 'Sunset General' },
    park: { x: 1300, y: 1025, label: 'Palm Court Park' },
    plaza: { x: 1900, y: 1025, label: 'Sunset Plaza' },
    spawn: { x: 700, y: 380 },
  };

  /** True when the point is inside a building, in the sea, or outside the world. */
  function solidAt(x, y) {
    if (x < 8 || y < 8 || x > WORLD.width - 8 || y > WORLD.height - 8) return true;
    if (x < BEACH.waterTo && !(x >= pier.x0 && x <= pier.x1 && y >= pier.y0 && y <= pier.y1)) return true;
    if (y > 2280) return true;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    return false;
  }

  /** Push a circle out of solid ground; returns true when it was pushed. */
  function resolveCircle(body, radius) {
    let pushed = false;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;
      pushed = true;
      if (d2 === 0) { body.y = b.y - radius; continue; }
      const d = Math.sqrt(d2);
      body.x = cx + (dx / d) * radius;
      body.y = cy + (dy / d) * radius;
    }
    if (body.x < BEACH.waterTo + radius && !(body.x >= pier.x0 && body.x <= pier.x1 && body.y >= pier.y0 && body.y <= pier.y1)) { body.x = BEACH.waterTo + radius; pushed = true; }
    if (body.y > 2280 - radius) { body.y = 2280 - radius; pushed = true; }
    if (body.x < radius) { body.x = radius; pushed = true; }
    if (body.x > WORLD.width - radius) { body.x = WORLD.width - radius; pushed = true; }
    if (body.y < radius) { body.y = radius; pushed = true; }
    if (body.y > WORLD.height - radius) { body.y = WORLD.height - radius; pushed = true; }
    return pushed;
  }

  return { blocks: allBlocks, buildings, trees, palms, parkedSpots, nodes, pier, marina, locations, solidAt, resolveCircle };
}
