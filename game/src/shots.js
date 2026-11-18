// The screenshot scenes behind ?shot=drive|chase|mission|foot. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (pure
// pursuit along waypoints on the road grid), so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';

const SAMPLE = STEP;

/** Pure-pursuit driving controls toward a point. */
function driveToward(car, tx, ty) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  return { mx: steer, my: Math.abs(diff) > 1.3 ? 0.4 : -1, sprint: false, enter: false, punch: false, shoot: false, aimX: tx, aimY: ty };
}

function putInCar(world, x, y, angle, type = 'sedan', color = '#d94f3d') {
  const state = world.state;
  const car = {
    x, y, angle, speed: 0, cruise: 0, color, type, driver: 'player',
    node: -1, prev: -1, brake: false, playerOwned: true,
  };
  state.cars.push(car);
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.camera.x = x;
  state.camera.y = y;
  return car;
}

function runWaypoints(world, waypoints, seconds) {
  let target = 0;
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const car = world.state.player.car;
    if (!car) break;
    const wp = waypoints[Math.min(target, waypoints.length - 1)];
    if (Math.hypot(wp.x - car.x, wp.y - car.y) < 80 && target < waypoints.length - 1) target += 1;
    world.step(SAMPLE, driveToward(car, wp.x, wp.y));
  }
}

function distToSegment(px, py, s) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

/** Take traffic cars off the planned route, so the shot is a clean drive, not a pile-up. */
function clearRoute(world, segments) {
  const cars = world.state.cars;
  for (let i = cars.length - 1; i >= 0; i -= 1) {
    const car = cars[i];
    if (car.driver !== 'traffic') continue;
    for (const s of segments) {
      if (distToSegment(car.x, car.y, s) < 110) {
        cars.splice(i, 1);
        break;
      }
    }
  }
}

function walkWaypoints(world, waypoints, secondsEach) {
  const player = world.state.player;
  for (const wp of waypoints) {
    const steps = Math.floor(secondsEach / SAMPLE);
    for (let i = 0; i < steps; i += 1) {
      const dx = wp.x - player.x;
      const dy = wp.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d < 18) break;
      world.step(SAMPLE, { mx: dx / d, my: dy / d, sprint: false, enter: false, punch: false, shoot: false, aimX: wp.x, aimY: wp.y });
    }
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best score
 * to show. Any unknown name stages the drive scene.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'chase') {
    state.missions.hide();
    putInCar(world, 1600, 500, Math.PI / 2, 'sport', '#3d7ab8');
    state.police.setWanted(3);
    // Two pursuers already on the player's tail, fanned out, so the chase reads at once.
    for (const [dy, off] of [[-240, -42], [-430, 42]]) {
      const copCar = {
        x: 1600 + off, y: 500 + dy, angle: Math.PI / 2, speed: 420, cruise: 0,
        color: '#e8e6df', type: 'police', driver: 'police', node: -1, prev: -1, brake: false,
        stuckTimer: 0, path: [], pathIndex: 0, lastX: 1600 + off, lastY: 500 + dy, chaseOffset: off,
      };
      state.police.copCars.push(copCar);
      state.cars.push(copCar);
    }
    clearRoute(world, [{ x1: 1600, y1: 500, x2: 1600, y2: 2100 }]);
    runWaypoints(world, [{ x: 1600, y: 1200 }, { x: 1600, y: 2050 }], 3.5);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    state.missions.start(1);
    const car = putInCar(world, 2500, 330, Math.PI, 'sedan', '#e8e6df');
    // One step on the warehouse doorstep picks the package up and starts the timer.
    world.step(SAMPLE, { mx: 0, my: 0, sprint: false, enter: false, punch: false, shoot: false, aimX: car.x, aimY: car.y });
    clearRoute(world, [
      { x1: 2500, y1: 350, x2: 1600, y2: 350 },
      { x1: 1600, y1: 350, x2: 1600, y2: 2100 },
      { x1: 1600, y1: 2100, x2: 1700, y2: 2150 },
    ]);
    runWaypoints(world, [{ x: 2200, y: 350 }, { x: 1600, y: 350 }, { x: 1600, y: 1700 }, { x: 1700, y: 2150 }], 7);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'foot') {
    state.missions.hide();
    const player = state.player;
    player.x = 1900;
    player.y = 1025;
    state.camera.x = player.x;
    state.camera.y = player.y;
    // A slow loop around the plaza, past pedestrians, never leaving it.
    walkWaypoints(world, [
      { x: 1850, y: 990 }, { x: 1960, y: 990 }, { x: 1960, y: 1080 }, { x: 1850, y: 1080 },
    ], 1.4);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  // drive (the cover): down Sunset Blvd in a red sedan, traffic and pedestrians around.
  state.missions.hide();
  putInCar(world, 1600, 400, Math.PI / 2, 'sedan', '#d94f3d');
  clearRoute(world, [{ x1: 1600, y1: 400, x2: 1600, y2: 2050 }]);
  runWaypoints(world, [{ x: 1600, y: 1200 }, { x: 1600, y: 2050 }], 3.5);
  return { screen: SCREEN_PLAY, best: 0 };
}
