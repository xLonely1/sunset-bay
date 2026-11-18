// The game's rules and state, with no drawing and no browser in it: the player on foot and in
// a car, collisions, combat, the wanted level's consequences, missions, thugs, bullets,
// particles, the camera and saving. step() advances one fixed step and returns what happened
// as an events object, so the caller can play sounds and announce without the world knowing
// about screens or sound. Nothing here allocates after createWorld returns, except bullets,
// particles and thugs, which are pooled by reuse where it is cheap.
import { CAR, PLAYER, POLICE, THUG, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = createCity(random);
  const traffic = createTraffic(city, random);
  const police = createPolice(city, random);
  const missions = createMissions(city);
  const cars = traffic.cars;
  const peds = traffic.peds;

  const player = {
    x: city.locations.spawn.x, y: city.locations.spawn.y, vx: 0, vy: 0, angle: -Math.PI / 2,
    health: PLAYER.health, cash: 0, car: null, weapon: 'fists',
    punchTimer: 0, shootTimer: 0, invuln: 0, hurtTimer: 0, regenTimer: 0,
    walkPhase: 0, moving: false,
  };
  const camera = { x: player.x, y: player.y, zoom: 1, trauma: 0 };
  const thugs = [];
  const bullets = [];
  const particles = [];
  const pickups = [];
  let aurora = null;
  let shootHeatTimer = 0;
  let busted = false;
  let wasted = false;
  let storyComplete = false;

  function burst(x, y, n, color, speed, life = 0.5) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.6);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + random() * 0.7), maxLife: life, size: 2 + random() * 3, color, kind: 'dot' });
    }
  }
  function smoke(x, y) {
    particles.push({ x, y, vx: (random() - 0.5) * 20, vy: -14 - random() * 16, life: 0.55, maxLife: 0.55, size: 4 + random() * 3, color: 'rgba(200,200,200,0.35)', kind: 'smoke' });
  }
  function ring(x, y, color) {
    particles.push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: 6, color, kind: 'ring' });
  }

  function spawnThug(x, y) {
    thugs.push({ x, y, angle: 0, health: THUG.health, punchTimer: 0, walkPhase: random() * 6, down: 0 });
  }

  function spawnAurora() {
    if (aurora) return;
    aurora = {
      x: city.locations.auroraSpot.x, y: city.locations.auroraSpot.y, angle: Math.PI / 2, speed: 0, cruise: 0,
      color: '#d9a441', type: 'sport', driver: 'parked', node: -1, prev: -1, brake: false, aurora: true,
    };
    cars.push(aurora);
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < cars.length; i += 1) {
      const car = cars[i];
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(events) {
    let car = nearestCar(player.x, player.y, 62);
    if (!car) return;
    // The Aurora Job: when the prize car is in reach, it is the car the player
    // means — the ride they arrived in parks right beside it, so picking the
    // nearer of the two by a few pixels would be a coin flip.
    if (missions.mission === 3 && missions.stage === 1 && aurora
        && Math.hypot(aurora.x - player.x, aurora.y - player.y) < 62) {
      car = aurora;
    }
    if (car.driver === 'traffic') {
      // Pull the driver out: a pedestrian far from the player becomes the evicted driver and runs.
      let best = null;
      let bestD = -1;
      for (const p of peds) {
        if (p.down > 0) continue;
        const dp = Math.hypot(p.x - player.x, p.y - player.y);
        if (dp > 600 && dp > bestD) { bestD = dp; best = p; }
      }
      if (best) {
        best.x = car.x + 30;
        best.y = car.y + 30;
        best.state = 'flee';
        best.timer = 2.5;
        best.angle = Math.atan2(best.y - player.y, best.x - player.x);
      }
      car.driver = 'player';
    } else if (car.driver === 'parked' || car.driver === 'police') {
      car.driver = 'player';
    } else {
      return;
    }
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.vx = 0;
    player.vy = 0;
    events.enteredCar = true;
    if (car === aurora) events.enteredAurora = true;
    // Stealing a car is a crime — but only the first time per car, so getting back into
    // your own ride does not stack the heat.
    if (!car.playerOwned) {
      car.playerOwned = true;
      police.addHeat(WANTED.heat.steal);
      events.announce = 'Car stolen — the cops noticed.';
    }
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    city.resolveCircle(player, PLAYER.radius);
    player.car = null;
  }

  function hurtPlayer(amount, events) {
    if (player.invuln > 0) return;
    player.health -= amount;
    player.invuln = 0.8;
    player.hurtTimer = 0.5;
    player.regenTimer = 0;
    camera.trauma = Math.min(1, camera.trauma + 0.35);
    if (player.health <= 0) {
      player.health = 0;
      wasted = true;
    }
  }

  function punch(events) {
    const range = PLAYER.punchRange + 12;
    const fx = Math.cos(player.angle);
    const fy = Math.sin(player.angle);
    let hit = false;
    for (let i = 0; i < thugs.length; i += 1) {
      const t = thugs[i];
      if (t.health <= 0) continue;
      const dx = t.x - player.x;
      const dy = t.y - player.y;
      if (Math.hypot(dx, dy) < range && Math.abs(angleDiff(Math.atan2(dy, dx), player.angle)) < 1.1) {
        t.health -= PLAYER.punchDamage;
        t.x += fx * 22;
        t.y += fy * 22;
        if (t.health <= 0) t.down = 999;
        burst(t.x, t.y, 8, '#ffd23d', 160);
        hit = true;
      }
    }
    for (let i = 0; i < police.cops.length; i += 1) {
      const cop = police.cops[i];
      const dx = cop.x - player.x;
      const dy = cop.y - player.y;
      if (Math.hypot(dx, dy) < range && Math.abs(angleDiff(Math.atan2(dy, dx), player.angle)) < 1.1) {
        if (police.hurt(cop, PLAYER.punchDamage)) burst(cop.x, cop.y, 8, '#ffd23d', 160);
        police.addHeat(WANTED.heat.hitPolice);
        hit = true;
      }
    }
    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      if (ped.down > 0) continue;
      const dx = ped.x - player.x;
      const dy = ped.y - player.y;
      if (Math.hypot(dx, dy) < range && Math.abs(angleDiff(Math.atan2(dy, dx), player.angle)) < 1.1) {
        ped.down = 4;
        ped.x += fx * 26;
        ped.y += fy * 26;
        police.addHeat(WANTED.heat.hitPed);
        burst(ped.x, ped.y, 6, '#ffd23d', 140);
        hit = true;
      }
    }
    events.soundPunch = hit;
  }

  function shoot(events, aimX, aimY) {
    const angle = Math.atan2(aimY - player.y, aimX - player.x);
    player.angle = angle;
    bullets.push({
      x: player.x + Math.cos(angle) * 22, y: player.y + Math.sin(angle) * 22,
      vx: Math.cos(angle) * PLAYER.bulletSpeed, vy: Math.sin(angle) * PLAYER.bulletSpeed, life: 0.9,
    });
    ring(player.x + Math.cos(angle) * 26, player.y + Math.sin(angle) * 26, '#ffd23d');
    if (shootHeatTimer <= 0) {
      shootHeatTimer = 4;
      police.addHeat(WANTED.heat.shoot);
    }
    events.soundShot = true;
    events.threats.push({ x: player.x, y: player.y, r: 340 });
  }

  function drive(dt, ctl, events) {
    const car = player.car;
    const top = CAR.topSpeed[car.type];
    const throttle = -ctl.my;
    if (throttle > 0) car.speed += CAR.accel * dt;
    else if (throttle < 0) {
      if (car.speed > 5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.accel * 0.6 * dt;
    } else {
      car.speed *= Math.max(0, 1 - CAR.drag * dt);
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    car.speed = Math.max(-CAR.reverseMax, Math.min(top, car.speed));
    const steer = ctl.mx;
    // A car that is creeping can still turn its wheels: without some steering at low speed
    // it can never get out of a parking spot or turn around, it just sits there.
    const creeping = Math.abs(car.speed) > 5 || throttle !== 0;
    const grip = creeping ? Math.max(0.35, Math.min(1, Math.abs(car.speed) / 130)) : 0;
    car.angle += steer * CAR.turnRate * grip * Math.sign(car.speed || (throttle >= 0 ? 1 : -1)) * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const pushed = city.resolveCircle(car, 17);
    if (pushed) {
      // Only a genuinely hard hit hurts: brushing a wall at city speed just costs momentum.
      if (Math.abs(car.speed) > 380) {
        hurtPlayer(4, events);
        events.soundCrash = true;
        camera.trauma = Math.min(1, camera.trauma + 0.5);
        burst(car.x, car.y, 10, '#e8e6df', 180);
      } else if (Math.abs(car.speed) > 140) {
        events.soundCrash = true;
      }
      car.speed *= 0.55;
    }
    if (Math.abs(steer) > 0.6 && Math.abs(car.speed) > 230 && Math.random() < 0.5) {
      smoke(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20);
    }
    if (throttle > 0 && Math.abs(car.speed) > 40 && Math.random() < 0.25) {
      smoke(car.x - Math.cos(car.angle) * 24, car.y - Math.sin(car.angle) * 24);
    }
    // Car against car: push apart, both slow down.
    for (let i = 0; i < cars.length; i += 1) {
      const other = cars[i];
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 36 && d > 0.01) {
        const overlap = 36 - d;
        const nx = dx / d;
        const ny = dy / d;
        if (other.speed === 0 && other.driver === 'parked') {
          car.x -= nx * overlap;
          car.y -= ny * overlap;
        } else {
          car.x -= nx * overlap * 0.5;
          car.y -= ny * overlap * 0.5;
          other.x += nx * overlap * 0.5;
          other.y += ny * overlap * 0.5;
          other.speed *= 0.8;
        }
        if (Math.abs(car.speed) > 160) {
          car.speed *= 0.82;
          events.soundCrash = true;
          camera.trauma = Math.min(1, camera.trauma + 0.3);
        }
      }
    }
    // Running someone over: the car slows a touch, the city notices.
    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26 && Math.abs(car.speed) > 50) {
        ped.down = 999;
        ped.x += Math.cos(car.angle) * 30;
        ped.y += Math.sin(car.angle) * 30;
        car.speed *= 0.96;
        police.addHeat(WANTED.heat.runOver);
        burst(ped.x, ped.y, 8, '#e5534b', 150);
        events.soundCrash = true;
      }
    }
    for (let i = 0; i < thugs.length; i += 1) {
      const t = thugs[i];
      if (t.health <= 0) continue;
      if (Math.hypot(t.x - car.x, t.y - car.y) < 26 && Math.abs(car.speed) > 50) {
        t.health -= 50;
        t.x += Math.cos(car.angle) * 34;
        t.y += Math.sin(car.angle) * 34;
        if (t.health <= 0) t.down = 999;
        car.speed *= 0.96;
        burst(t.x, t.y, 10, '#ffd23d', 170);
        events.soundCrash = true;
      }
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.vx = Math.cos(car.angle) * car.speed;
    player.vy = Math.sin(car.angle) * car.speed;
  }

  function walk(dt, ctl, events) {
    const speed = ctl.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const tx = ctl.mx * speed;
    const ty = ctl.my * speed;
    player.vx += (tx - player.vx) * Math.min(1, dt * 11);
    player.vy += (ty - player.vy) * Math.min(1, dt * 11);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    city.resolveCircle(player, PLAYER.radius);
    const moving = Math.hypot(player.vx, player.vy) > 24;
    player.moving = moving;
    if (moving) {
      player.angle = Math.atan2(player.vy, player.vx);
      player.walkPhase += dt * Math.hypot(player.vx, player.vy) * 0.055;
    }
    // Bumped by a moving car: it hurts, and it shoves.
    for (let i = 0; i < cars.length; i += 1) {
      const car = cars[i];
      if (car.driver === 'player' || Math.abs(car.speed) < 30) continue;
      if (Math.hypot(car.x - player.x, car.y - player.y) < 26) {
        hurtPlayer(8, events);
        player.x += (player.x - car.x) * 0.4;
        player.y += (player.y - car.y) * 0.4;
        city.resolveCircle(player, PLAYER.radius);
        events.soundCrash = true;
      }
    }
  }

  function updateThugs(dt, events) {
    for (let i = 0; i < thugs.length; i += 1) {
      const t = thugs[i];
      if (t.health <= 0) continue;
      const dx = player.x - t.x;
      const dy = player.y - t.y;
      const d = Math.hypot(dx, dy) || 1;
      t.walkPhase += dt * 7;
      if (player.car && Math.abs(player.car.speed) > 80 && d < 130) {
        // A speeding car: get out of its way.
        t.angle = Math.atan2(t.y - player.y, t.x - player.x);
        t.x += Math.cos(t.angle) * THUG.speed * 1.1 * dt;
        t.y += Math.sin(t.angle) * THUG.speed * 1.1 * dt;
      } else if (d > THUG.punchRange) {
        t.angle = Math.atan2(dy, dx);
        t.x += Math.cos(t.angle) * THUG.speed * dt;
        t.y += Math.sin(t.angle) * THUG.speed * dt;
      } else {
        t.punchTimer -= dt;
        if (t.punchTimer <= 0 && !player.car) {
          t.punchTimer = THUG.punchCooldown;
          hurtPlayer(THUG.punchDamage, events);
          events.soundPunch = true;
        }
      }
      city.resolveCircle(t, 12);
    }
  }

  function updateBullets(dt, events) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || city.solidAt(b.x, b.y);
      if (dead && b.life > 0) burst(b.x, b.y, 4, '#ffd23d', 120, 0.3);
      if (!dead) {
        for (let j = 0; j < thugs.length; j += 1) {
          const t = thugs[j];
          if (t.health > 0 && Math.hypot(t.x - b.x, t.y - b.y) < 16) {
            t.health -= PLAYER.bulletDamage;
            if (t.health <= 0) t.down = 999;
            burst(t.x, t.y, 8, '#e5534b', 160);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = 0; j < police.cops.length; j += 1) {
          const cop = police.cops[j];
          if (Math.hypot(cop.x - b.x, cop.y - b.y) < 16) {
            police.hurt(cop, PLAYER.bulletDamage);
            police.addHeat(WANTED.heat.hitPolice);
            burst(cop.x, cop.y, 8, '#e5534b', 160);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = 0; j < peds.length; j += 1) {
          const ped = peds[j];
          if (ped.down === 0 && Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
            ped.down = 999;
            police.addHeat(WANTED.heat.hitPed);
            burst(ped.x, ped.y, 8, '#e5534b', 160);
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 2.4 * dt);
      p.vy *= Math.max(0, 1 - 2.4 * dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  const state = {
    city, player, camera, cars, peds, thugs, bullets, particles, pickups,
    police, missions, aurora: () => aurora,
    get busted() { return busted; },
    get wasted() { return wasted; },
    get storyComplete() { return storyComplete; },
  };

  function reset() {
    player.x = city.locations.spawn.x;
    player.y = city.locations.spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.cash = 0;
    player.car = null;
    player.weapon = 'fists';
    player.punchTimer = 0;
    player.shootTimer = 0;
    player.invuln = 0;
    camera.x = player.x;
    camera.y = player.y;
    camera.zoom = 1;
    camera.trauma = 0;
    thugs.length = 0;
    bullets.length = 0;
    particles.length = 0;
    pickups.length = 0;
    aurora = null;
    busted = false;
    wasted = false;
    storyComplete = false;
    police.clear();
    missions.start(0);
  }

  /** One fixed step. `ctl` is {mx, my, sprint, enter, punch, shoot, aimX, aimY}. */
  function step(dt, ctl) {
    const events = { threats: [], enteredCar: false, enteredAurora: false };
    player.punchTimer = Math.max(0, player.punchTimer - dt);
    player.shootTimer = Math.max(0, player.shootTimer - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    shootHeatTimer = Math.max(0, shootHeatTimer - dt);
    player.regenTimer += dt;
    if (player.regenTimer > 5 && player.health > 0 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 3 * dt);
    }

    if (ctl.enter) {
      if (player.car) exitCar();
      else enterCar(events);
    }
    if (player.car) drive(dt, ctl, events);
    else {
      walk(dt, ctl, events);
      if (ctl.punch && player.punchTimer <= 0) {
        player.punchTimer = PLAYER.punchCooldown;
        punch(events);
      }
      if (ctl.shoot && player.weapon === 'pistol' && player.shootTimer <= 0) {
        player.shootTimer = PLAYER.shootCooldown;
        shoot(events, ctl.aimX, ctl.aimY);
      } else if (ctl.shoot && player.weapon !== 'pistol') {
        events.soundDenied = true;
      }
    }
    if (player.car && Math.abs(player.car.speed) > 200) {
      events.threats.push({ x: player.car.x, y: player.car.y, r: 140 });
    }

    traffic.update(dt, cars, events.threats);
    const policeEvents = police.update(dt, {
      px: player.x, py: player.y, pvx: player.vx, pvy: player.vy,
      inCar: !!player.car, cars,
      // A player who is actively fighting back cannot be grabbed: the bust only
      // builds while he stands idle. Otherwise the Pier Brawl — three thugs,
      // fists, standing still — would end in a cop bust instead of a fight.
      playerAttacking: player.punchTimer > 0 || player.shootTimer > 0,
    });
    if (policeEvents.damage > 0) hurtPlayer(policeEvents.damage, events);
    if (policeEvents.busted) busted = true;
    if (policeEvents.rammed) events.soundCrash = true;

    updateThugs(dt, events);
    updateBullets(dt, events);
    updateParticles(dt);

    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const pk = pickups[i];
      if (Math.hypot(pk.x - player.x, pk.y - player.y) < 34) {
        player.cash += pk.amount;
        events.soundPickup = true;
        events.announce = `+$${pk.amount}`;
        pickups.splice(i, 1);
      }
    }

    const missionEvents = missions.update(dt, {
      px: player.x, py: player.y, inCar: !!player.car,
      inAurora: player.car === aurora && !!aurora,
      enteredCar: events.enteredCar, enteredAurora: events.enteredAurora,
      thugsAlive: thugs.filter((t) => t.health > 0).length,
    });
    if (missionEvents.spawnThugs) {
      for (const s of missionEvents.spawnThugs) spawnThug(s.x, s.y);
    }
    if (missionEvents.spawnAurora) spawnAurora();
    if (missionEvents.givePistol) {
      player.weapon = 'pistol';
      events.announce = 'Lena gave you her pistol — F or click to shoot.';
    }
    if (missionEvents.addHeat) police.addHeat(missionEvents.addHeat);
    if (missionEvents.setWanted) police.setWanted(missionEvents.setWanted);
    if (missionEvents.spawnCash) pickups.push({ x: missionEvents.spawnCash.x, y: missionEvents.spawnCash.y, kind: 'cash', amount: 300 });
    if (missionEvents.completed) {
      player.cash += missionEvents.reward;
      events.soundJingle = true;
      events.missionComplete = true;
      events.reward = missionEvents.reward;
      // No announce line here: the toast banner carries the same message.
      if (missions.storyDone) storyComplete = true;
    }
    if (missionEvents.failed) {
      events.missionFailed = true;
      events.announce = 'Mission failed.';
    }

    // Camera: follow with a lookahead in the direction of travel, zoom out as speed grows.
    const look = 0.22;
    const tx = player.x + player.vx * look;
    const ty = player.y + player.vy * look;
    const k = 1 - Math.exp(-5 * dt);
    camera.x += (tx - camera.x) * k;
    camera.y += (ty - camera.y) * k;
    const speed = player.car ? Math.abs(player.car.speed) : Math.hypot(player.vx, player.vy);
    const targetZoom = player.car ? 1 - Math.min(0.2, speed / 2600) : 1;
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 2.5);
    camera.trauma = Math.max(0, camera.trauma - dt * 1.4);
    return events;
  }

  /** After a bust or a waste: back on your feet at the hospital, mission restarts. */
  function respawn() {
    if (player.car) {
      player.car.driver = 'parked';
      player.car.speed = 0;
      player.car = null;
    }
    player.x = city.locations.hospital.x;
    player.y = 2030;
    player.vx = 0;
    player.vy = 0;
    player.health = PLAYER.health;
    player.invuln = 1;
    if (busted) player.cash = Math.floor(player.cash * 0.85);
    busted = false;
    wasted = false;
    police.clear();
    // The mission restarts clean: thugs and the cash bag are gone, and a stolen Aurora
    // goes back to the casino so the job can be tried again.
    thugs.length = 0;
    pickups.length = 0;
    if (aurora) {
      const index = cars.indexOf(aurora);
      if (index !== -1) cars.splice(index, 1);
      aurora = null;
    }
    missions.retry();
    camera.x = player.x;
    camera.y = player.y;
    camera.zoom = 1;
  }

  function save() {
    return {
      mission: missions.mission, cash: player.cash, weapon: player.weapon,
      storyDone: missions.storyDone,
    };
  }

  function load(data) {
    if (!data) return;
    player.cash = data.cash || 0;
    player.weapon = data.weapon || 'fists';
    missions.restore(typeof data.mission === 'number' ? data.mission : 0, !!data.storyDone);
  }

  return { state, step, reset, respawn, save, load };
}
