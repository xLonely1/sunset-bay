// The wanted system and the police. Foot cops run the player down and, if they stay on him,
// bust him; police cars chase by road, and if one gets stuck on a building it routes around
// the block on the road graph (a short BFS) instead of grinding against a wall forever.
import { CAR, POLICE, WANTED } from './config.js';

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function createPolice(city, random) {
  const nodes = city.nodes;
  const cops = [];
  const copCars = [];
  let wanted = 0;
  let quietTimer = 0;

  function nearestNode(x, y) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].y - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Shortest path on the road graph, as a list of node indices. */
  function route(from, to) {
    if (from === to) return [to];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const link of nodes[cur].links) {
        if (prev[link] !== -1) continue;
        prev[link] = cur;
        if (link === to) {
          const path = [to];
          let at = to;
          while (at !== from) { at = prev[at]; path.unshift(at); }
          return path;
        }
        queue.push(link);
      }
    }
    return [to];
  }

  function spawnPoint(px, py) {
    for (let tries = 0; tries < 12; tries += 1) {
      const node = nodes[Math.floor(random() * nodes.length)];
      const d = Math.hypot(node.x - px, node.y - py);
      if (d > 650 && d < 1100) return { x: node.x, y: node.y };
    }
    return { x: px + 800, y: py };
  }

  function desiredCounts(inCar) {
    if (wanted === 0) return { foot: 0, cars: 0 };
    if (inCar) return { foot: 0, cars: Math.min(wanted, 3) };
    return { foot: Math.min(1 + wanted, 5), cars: wanted >= 3 ? 1 : 0 };
  }

  function spawnCop(px, py) {
    const at = spawnPoint(px, py);
    cops.push({ x: at.x, y: at.y, angle: 0, health: POLICE.footHealth, punchTimer: 0, bustTimer: 0, walkPhase: random() * 6 });
  }

  function spawnCopCar(px, py, cars) {
    const at = spawnPoint(px, py);
    const car = {
      x: at.x, y: at.y, angle: 0, speed: 0, cruise: 0, color: '#e8e6df', type: 'police',
      driver: 'police', node: -1, prev: -1, brake: false, stuckTimer: 0, path: [], pathIndex: 0, lastX: at.x, lastY: at.y,
      chaseOffset: (copCars.length % 3 - 1) * 42, backoff: 0,
    };
    copCars.push(car);
    cars.push(car);
    return car;
  }

  return {
    get wanted() { return wanted; },
    cops,
    copCars,
    addHeat(n) {
      if (wanted >= WANTED.max) { quietTimer = 0; return; }
      wanted = Math.min(WANTED.max, wanted + n);
      quietTimer = 0;
    },
    clear() {
      wanted = 0;
      quietTimer = 0;
      cops.length = 0;
      copCars.length = 0;
    },
    /** Set the wanted level directly (the Aurora job's alarm). */
    setWanted(n) {
      wanted = Math.max(0, Math.min(WANTED.max, n));
      quietTimer = 0;
    },
    /** Hurt a foot cop; returns true when he went down and was removed. */
    hurt(cop, dmg) {
      cop.health -= dmg;
      if (cop.health <= 0) {
        const index = cops.indexOf(cop);
        if (index !== -1) cops.splice(index, 1);
        return true;
      }
      return false;
    },
    nearestDistance(px, py) {
      let best = Infinity;
      for (const c of cops) best = Math.min(best, Math.hypot(c.x - px, c.y - py));
      for (const c of copCars) best = Math.min(best, Math.hypot(c.x - px, c.y - py));
      return best;
    },
    update(dt, ctx) {
      const events = { damage: 0, busted: false, rammed: false };
      quietTimer += dt;
      if (wanted > 0 && quietTimer > WANTED.decaySeconds && this.nearestDistance(ctx.px, ctx.py) > 500) {
        wanted -= 1;
        quietTimer = 0;
      }
      const want = desiredCounts(ctx.inCar);
      while (cops.length < want.foot) spawnCop(ctx.px, ctx.py);
      while (copCars.length < want.cars) spawnCopCar(ctx.px, ctx.py, ctx.cars);
      while (cops.length > want.foot) cops.pop();
      // Cop cars the player outran are removed with the rest of the force when wanted drops.
      while (copCars.length > want.cars) {
        const car = copCars.pop();
        const index = ctx.cars.indexOf(car);
        if (index !== -1) ctx.cars.splice(index, 1);
      }

      for (const cop of cops) {
        const dx = ctx.px - cop.x;
        const dy = ctx.py - cop.y;
        const d = Math.hypot(dx, dy) || 1;
        cop.walkPhase += dt * 9;
        if (d > 46) {
          cop.angle = Math.atan2(dy, dx);
          cop.x += Math.cos(cop.angle) * POLICE.footSpeed * dt;
          cop.y += Math.sin(cop.angle) * POLICE.footSpeed * dt;
          city.resolveCircle(cop, 11);
          cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
        } else {
          cop.punchTimer -= dt;
          // No grab while the player is fighting back: the bust timer only builds
          // when he stands idle next to the cop, and bleeds off while he attacks.
          if (ctx.playerAttacking) cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
          else cop.bustTimer += dt;
          if (cop.punchTimer <= 0) {
            cop.punchTimer = POLICE.punchCooldown;
            events.damage += POLICE.punchDamage;
          }
          if (cop.bustTimer >= POLICE.bustTime) events.busted = true;
        }
      }

      for (const car of copCars) {
        const tx = ctx.px + (ctx.pvx ?? 0) * 0.4;
        const ty = ctx.py + (ctx.pvy ?? 0) * 0.4;
        const d = Math.hypot(tx - car.x, ty - car.y);
        // Each pursuer aims a little to one side, so they fan out instead of piling up.
        const dirx = d > 1 ? (tx - car.x) / d : 1;
        const diry = d > 1 ? (ty - car.y) / d : 0;
        const aimTx = tx - diry * (car.chaseOffset || 0);
        const aimTy = ty + dirx * (car.chaseOffset || 0);
        const moved = Math.hypot(car.x - car.lastX, car.y - car.lastY);
        if (dt > 0 && moved / dt < 30 && car.speed > 60) car.stuckTimer += dt;
        else car.stuckTimer = 0;
        car.lastX = car.x;
        car.lastY = car.y;
        let aimX = aimTx;
        let aimY = aimTy;
        let throttle = 1;
        // After a ram the pursuer peels off for a moment instead of sitting on
        // the player's car: without the gap, two pursuers and a wall make a cage
        // the player cannot drive out of.
        car.backoff = Math.max(0, (car.backoff ?? 0) - dt);
        if (car.backoff > 0) {
          aimX = car.x + (car.x - ctx.px);
          aimY = car.y + (car.y - ctx.py);
        } else if (d < 60 && !ctx.inCar) {
          // On top of a player on foot: ram him, then back off and come again.
          throttle = 1;
        } else if (car.stuckTimer > 1.2 || d > 350) {
          if (car.path.length === 0 || car.pathIndex >= car.path.length) {
            car.path = route(nearestNode(car.x, car.y), nearestNode(tx, ty));
            car.pathIndex = 0;
          }
          const node = nodes[car.path[Math.min(car.pathIndex, car.path.length - 1)]];
          aimX = node.x;
          aimY = node.y;
          if (Math.hypot(node.x - car.x, node.y - car.y) < 40) car.pathIndex += 1;
        } else {
          car.path = [];
          car.pathIndex = 0;
        }
        const desired = Math.atan2(aimY - car.y, aimX - car.x);
        const turn = angleLerp(car.angle, desired, dt * 3.4);
        const turning = Math.abs(turn - car.angle);
        car.angle = turn;
        // A pursuer never grinds into a player who is already stopped: it holds
        // off instead, so the player can always reverse out of a wedge instead
        // of being pinned against a wall by two bumpers.
        const playerSpeed = Math.hypot(ctx.pvx ?? 0, ctx.pvy ?? 0);
        if (car.backoff <= 0 && d < 110 && playerSpeed < 40) throttle = 0;
        const top = CAR.topSpeed.police * (turning > 0.5 ? 0.55 : 1);
        car.speed += ((throttle ? top : 0) - car.speed) * Math.min(1, dt * 1.1);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        const hitWall = city.resolveCircle(car, 16);
        if (hitWall && car.speed > 120) car.speed *= 0.6;
        // Ram: touching the player's car, or the player on foot, at speed — but not twice
        // in a row: a ram costs the pursuer its speed and a short cooldown.
        const pd = Math.hypot(ctx.px - car.x, ctx.py - car.y);
        car.ramTimer = Math.max(0, (car.ramTimer ?? 0) - dt);
        if (pd < 40 && car.speed > 140 && car.ramTimer <= 0) {
          events.damage += 3;
          events.rammed = true;
          car.speed *= 0.4;
          car.ramTimer = 2;
          car.backoff = 1.5;
        }
      }
      return events;
    },
  };
}
