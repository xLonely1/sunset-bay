// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, busted/wasted, mission failed and story
// complete. Progress (mission, cash, weapon, story) is saved to localStorage on every mission
// completion and on every bust or waste.
//
// ?seed=N fixes the city's random layout. ?shot=drive|chase|mission|foot (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot. window.__sunset exposes the live state for playtesting.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { readSave, writeSave } from './save.js';
import { createRenderer, SCREEN_FAILED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas, world.state.city);
const audio = createAudio();
const saved = readSave();

// The live screen, shared with the playtest hooks below: runGame owns it in game mode,
// runShot sets it to the staged scene's screen in shot mode.
let screen = SCREEN_TITLE;

// A handle for playtesting: the live state, one line of facts about it, and a way to jump
// to a mission (used only by the automated playtest and the screenshot staging, never by
// the game itself). Hoisted to module level so it also exists in ?shot= mode.
window.__sunset = {
  state: world.state,
  startMission(i) {
    world.state.missions.start(i);
  },
  debug() {
    const p = world.state.player;
    const obj = world.state.missions.objective(p.x, p.y);
    let car = null;
    let carD = Infinity;
    for (const c of world.state.cars) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < carD) { carD = d; car = c; }
    }
    let thug = null;
    let thugD = Infinity;
    for (const t of world.state.thugs) {
      if (t.health <= 0) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < thugD) { thugD = d; thug = t; }
    }
    return JSON.stringify({
      screen, x: Math.round(p.x), y: Math.round(p.y), angle: Math.round(p.angle * 100) / 100,
      health: Math.round(p.health), cash: p.cash, wanted: world.state.police.wanted,
      mission: world.state.missions.mission, stage: world.state.missions.stage,
      inCar: !!p.car, speed: p.car ? Math.round(p.car.speed) : 0,
      cops: world.state.police.cops.length, copCars: world.state.police.copCars.length,
      thugs: world.state.thugs.filter((t) => t.health > 0).length,
      cars: world.state.cars.length, peds: world.state.peds.length,
      weapon: p.weapon, timer: obj?.timer ?? null,
      target: obj?.target ? { x: obj.target.x, y: obj.target.y } : null,
      car: car ? { x: Math.round(car.x), y: Math.round(car.y), d: Math.round(carD) } : null,
      aurora: (() => {
        const a = world.state.aurora();
        return a ? { x: Math.round(a.x), y: Math.round(a.y), d: Math.round(Math.hypot(a.x - p.x, a.y - p.y)) } : null;
      })(),
      thug: thug ? { d: Math.round(thugD), angle: Math.round(Math.atan2(thug.y - p.y, thug.x - p.x) * 100) / 100 } : null,
    });
  },
};

function runShot(name) {
  const scene = stageShot(name, world);
  screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: 0, hasSave: false, toast: null, announce: null, hint: '' });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const random = createRandom(seed ^ 0x9e3779b9);
  let overKind = 'wasted';
  let failReason = '';
  let best = saved?.best ?? 0;
  let hasSave = !!saved && !saved.storyDone && typeof saved.mission === 'number' && saved.mission > 0;
  let toast = null;
  let toastTimer = 0;
  let announce = null;
  let announceTimer = 0;
  let muted = false;
  let accumulator = 0;
  let last = performance.now();
  let attractT = random() * 100;

  function announceLine(message) {
    status.textContent = message;
    announce = message;
    announceTimer = 3;
  }

  function persist() {
    const data = world.save();
    best = Math.max(best, world.state.player.cash);
    writeSave({ ...data, best });
    hasSave = !data.storyDone && data.mission > 0;
  }

  function startGame(fromSave) {
    world.reset();
    if (fromSave && saved) {
      world.load(saved);
      announceLine(`Welcome back — mission ${world.state.missions.mission + 1}.`);
    } else {
      world.state.missions.start(0);
      announceLine(world.state.missions.intro());
    }
    toast = null;
    toastTimer = 0;
    accumulator = 0;
    screen = SCREEN_PLAY;
  }

  function applyEvents(events) {
    if (events.soundPunch) audio.punch();
    if (events.soundShot) audio.gunshot();
    if (events.soundCrash) audio.crash(true);
    if (events.soundPickup) audio.pickup();
    if (events.soundJingle) audio.jingle();
    if (events.soundDenied) audio.denied();
    if (events.announce) announceLine(events.announce);
    if (events.missionComplete) {
      toast = `Mission complete — +$${events.reward}`;
      toastTimer = 2.6;
      persist();
      if (world.state.storyComplete) {
        screen = SCREEN_STORY;
        announceLine('Story complete — Sunset Bay is yours.');
      }
    }
    if (events.missionFailed) {
      failReason = 'The delivery window closed.';
      screen = SCREEN_FAILED;
    }
    if (world.state.busted) {
      overKind = 'busted';
      audio.busted();
      screen = SCREEN_OVER;
      persist();
    } else if (world.state.wasted) {
      overKind = 'wasted';
      audio.busted();
      screen = SCREEN_OVER;
      persist();
    }
  }

  function hintFor() {
    const p = world.state.player;
    if (p.car) return 'WASD — Drive · E — Get out · P — Pause';
    const near = world.state.cars.some((car) => Math.hypot(car.x - p.x, car.y - p.y) < 62);
    if (near) return 'E — Steal car';
    return p.weapon === 'pistol' ? 'Space — Punch · F / Click — Shoot · Shift — Sprint' : 'Space — Punch · Shift — Sprint';
  }

  function stepPlay(dt) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      announceLine(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announceLine('Paused.');
      return;
    }
    const move = input.move();
    const dpr = window.devicePixelRatio || 1;
    const cam = world.state.camera;
    const aimX = (input.mouse.x * dpr - (canvas.width / 2 - cam.x * cam.zoom)) / cam.zoom;
    const aimY = (input.mouse.y * dpr - (canvas.height / 2 - cam.y * cam.zoom)) / cam.zoom;
    const events = world.step(dt, {
      mx: move.x, my: move.y, sprint: move.sprint,
      enter: !!(actions & ACTION_ENTER),
      punch: !!(actions & ACTION_PUNCH),
      shoot: !!(actions & ACTION_SHOOT),
      aimX, aimY,
    });
    const driving = !!world.state.player.car;
    const speed01 = driving ? Math.abs(world.state.player.car.speed) / 520 : 0;
    audio.update(dt, driving, speed01, world.state.police.nearestDistance(world.state.player.x, world.state.player.y));
    applyEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    accumulator += frameDt;
    toastTimer = Math.max(0, toastTimer - frameDt);
    announceTimer = Math.max(0, announceTimer - frameDt);
    if (screen === SCREEN_TITLE) {
      const actions = input.takeActions();
      audio.unlock();
      if (actions & (ACTION_CONFIRM | ACTION_SHOOT)) startGame(false);
      else if (actions & ACTION_MUTE) {
        muted = !muted;
        audio.setMuted(muted);
      } else {
        // The title screen's backdrop is the living city, slowly panned over.
        world.step(STEP, { mx: 0, my: 0, sprint: false, enter: false, punch: false, shoot: false, aimX: 0, aimY: 0 });
        attractT += STEP;
        world.state.camera.x = 1600 + Math.cos(attractT * 0.06) * 620;
        world.state.camera.y = 1200 + Math.sin(attractT * 0.06) * 420;
        world.state.camera.zoom = 0.85;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepPlay(STEP);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PAUSED) {
      const actions = input.takeActions();
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announceLine('Playing.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_OVER) {
      const actions = input.takeActions();
      if (actions & (ACTION_CONFIRM | ACTION_SHOOT)) {
        world.respawn();
        screen = SCREEN_PLAY;
        announceLine('Back on the street. The mission restarts.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_FAILED) {
      const actions = input.takeActions();
      if (actions & (ACTION_CONFIRM | ACTION_SHOOT)) {
        world.state.missions.retry();
        screen = SCREEN_PLAY;
        announceLine('Try the mission again.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_STORY) {
      const actions = input.takeActions();
      if (actions & (ACTION_CONFIRM | ACTION_SHOOT)) {
        screen = SCREEN_PLAY;
        announceLine('Free roam — Sunset Bay is yours.');
      }
      accumulator = 0;
    }
    renderer.draw(world.state, screen, {
      best, hasSave,
      saveMission: saved?.mission ?? 0,
      saveCash: saved?.cash ?? 0,
      toast: toastTimer > 0 ? toast : null,
      toastTimer,
      announce: announceTimer > 0 ? announce : null,
      announceTimer,
      overKind, failReason,
      hint: screen === SCREEN_PLAY ? hintFor() : '',
    });
  }

  // Continue a saved game with C, on the title screen only.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && hasSave) {
      audio.unlock();
      startGame(true);
    }
  });

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announceLine('Paused.');
    }
  });

  announceLine('Sunset Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
