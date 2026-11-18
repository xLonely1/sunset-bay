// Traffic and pedestrians. Both travel on the road graph, so they stay on roads and
// sidewalks and never walk through a building. Traffic cars keep a lane offset to the right of
// their direction of travel and brake for the car ahead; pedestrians walk the sidewalk edge and
// run when something scares them.
import { CAR, PEDS, ROADS, TRAFFIC } from './config.js';

const CAR_COLORS = CAR.colors;

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function createTraffic(city, random) {
  const cars = [];
  const peds = [];
  const nodes = city.nodes;

  function randomEdgePoint() {
    const node = nodes[Math.floor(random() * nodes.length)];
    const next = node.links[Math.floor(random() * node.links.length)];
    const other = nodes[next];
    const t = random();
    return { x: node.x + (other.x - node.x) * t, y: node.y + (other.y - node.y) * t, node, next };
  }

  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const spot = randomEdgePoint();
    const dx = nodes[spot.next].x - spot.node.x;
    const dy = nodes[spot.next].y - spot.node.y;
    const len = Math.hypot(dx, dy) || 1;
    // Right-hand lane: offset to the right of the direction of travel.
    const ox = (-dy / len) * 20;
    const oy = (dx / len) * 20;
    cars.push({
      x: spot.x + ox, y: spot.y + oy, angle: Math.atan2(dy, dx),
      speed: TRAFFIC.cruiseMin + random() * 30,
      cruise: TRAFFIC.cruiseMin + random() * (TRAFFIC.cruiseMax - TRAFFIC.cruiseMin),
      color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      type: random() < 0.12 ? 'truck' : random() < 0.2 ? 'taxi' : 'sedan',
      driver: 'traffic', node: spot.next, prev: nodes.indexOf(spot.node), brake: false,
    });
  }
  for (let i = 0; i < TRAFFIC.parked; i += 1) {
    const spot = city.parkedSpots[i % city.parkedSpots.length];
    cars.push({
      x: spot.x, y: spot.y, angle: 0, speed: 0, cruise: 0,
      color: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      type: random() < 0.15 ? 'sport' : 'sedan', driver: 'parked', node: -1, prev: -1, brake: false,
    });
  }
  for (let i = 0; i < PEDS.count; i += 1) {
    const start = nodes[Math.floor(random() * nodes.length)];
    const next = start.links[Math.floor(random() * start.links.length)];
    peds.push({
      x: start.x + (random() - 0.5) * 40, y: start.y + (random() - 0.5) * 40,
      angle: random() * Math.PI * 2, speed: PEDS.walkMin + random() * (PEDS.walkMax - PEDS.walkMin),
      shirt: CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
      pants: ['#2b2e33', '#3a4a5e', '#5e4632', '#4a4a4a'][Math.floor(random() * 4)],
      node: nodes.indexOf(start), next, side: random() < 0.5 ? -1 : 1,
      state: 'walk', tx: 0, ty: 0, timer: 0, down: 0, walkPhase: random() * 6,
    });
  }

  function nodePos(index, side) {
    const node = nodes[index];
    return { x: node.x, y: node.y };
  }

  /** Sidewalk point for a ped travelling from `from` to `to`, on its chosen side: just off the
   * asphalt, on the block's edge, so pedestrians walk the sidewalk and not the traffic lane. */
  function sidewalkPoint(from, to, side) {
    const a = nodes[from];
    const b = nodes[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // The road crossed perpendicular to travel: an avenue when moving north-south.
    const roadW = Math.abs(dx) > 0 ? ROADS.streetWidth : ROADS.avenueWidth;
    const off = (roadW / 2 + 12) * side;
    return { x: b.x + (-dy / len) * off, y: b.y + (dx / len) * off };
  }

  function updateCar(car, dt, allCars) {
    if (car.driver !== 'traffic') return;
    const target = nodes[car.node];
    const prev = nodes[car.prev] ?? target;
    // Aim at the node shifted into the right-hand lane, so cars stay in their lane.
    let dx = target.x - prev.x;
    let dy = target.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const tx = target.x - dy * 20;
    const ty = target.y + dx * 20;
    const ox = tx - car.x;
    const oy = ty - car.y;
    const dist = Math.hypot(ox, oy);
    if (dist < 26) {
      const links = target.links.filter((l) => l !== car.prev);
      const next = links.length > 0 ? links[Math.floor(random() * links.length)] : target.links[0];
      car.prev = car.node;
      car.node = next;
      return;
    }
    // Brake for the car ahead in our lane.
    let want = car.cruise;
    for (let i = 0; i < allCars.length; i += 1) {
      const other = allCars[i];
      if (other === car || other.speed === 0 && other.driver === 'parked') continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (ahead > 0 && ahead < TRAFFIC.followGap && side < 26) { want = 0; break; }
    }
    const desired = Math.atan2(oy, ox);
    car.angle = angleLerp(car.angle, desired, dt * 3.2);
    car.speed += (want - car.speed) * Math.min(1, dt * (want > car.speed ? 0.9 : 3.2));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.brake = want === 0;
  }

  function updatePed(ped, dt, threats) {
    if (ped.down > 0) {
      ped.down = Math.max(0, ped.down - dt);
      return;
    }
    ped.walkPhase += dt * ped.speed * 0.09;
    if (ped.state === 'flee') {
      ped.timer -= dt;
      ped.x += Math.cos(ped.angle) * PEDS.fleeSpeed * dt;
      ped.y += Math.sin(ped.angle) * PEDS.fleeSpeed * dt;
      city.resolveCircle(ped, 10);
      if (ped.timer <= 0) {
        ped.state = 'walk';
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < nodes.length; i += 1) {
          const d = (nodes[i].x - ped.x) ** 2 + (nodes[i].y - ped.y) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
        ped.node = best;
        ped.next = nodes[best].links[Math.floor(random() * nodes[best].links.length)];
      }
      return;
    }
    for (let i = 0; i < threats.length; i += 1) {
      const t = threats[i];
      const d = Math.hypot(ped.x - t.x, ped.y - t.y);
      if (d < t.r) {
        ped.state = 'flee';
        ped.timer = 2 + random() * 1.5;
        ped.angle = Math.atan2(ped.y - t.y, ped.x - t.x);
        return;
      }
    }
    const point = sidewalkPoint(ped.node, ped.next, ped.side);
    const dx = point.x - ped.x;
    const dy = point.y - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) {
      ped.node = ped.next;
      const links = nodes[ped.next].links.filter((l) => l !== ped.node);
      ped.next = links.length > 0 ? links[Math.floor(random() * links.length)] : nodes[ped.next].links[0];
      return;
    }
    ped.angle = Math.atan2(dy, dx);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }

  return {
    cars,
    peds,
    nodePos,
    update(dt, allCars, threats) {
      for (let i = 0; i < cars.length; i += 1) updateCar(cars[i], dt, allCars);
      for (let i = 0; i < peds.length; i += 1) updatePed(peds[i], dt, threats);
    },
  };
}
