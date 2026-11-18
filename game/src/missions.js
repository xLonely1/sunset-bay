// The story: four missions from Rico and Lena, each a short chain of stages. A stage is one
// verb — steal a car, go somewhere, beat the thugs, grab the bag, escape — and the module only
// decides what is complete and what happens next; the world owns the entities it asks for.
// Every target is a real place in the city, and every mission pays cash on completion.
import { MISSION_CASH } from './config.js';

export const MISSION_DEFS = [
  {
    contact: 'Rico',
    title: 'First Wheels',
    intro: 'Rico: "New in town? You need wheels. Take any car on the street — press E next to one — then bring it to Sunset Paint & Body so we can make it yours."',
    reward: MISSION_CASH[0],
    stages: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', target: 'paint', radius: 80, text: 'Take the car to Sunset Paint & Body' },
    ],
  },
  {
    contact: 'Rico',
    title: 'Harbor Run',
    intro: 'Rico: "A package is waiting at Harbor Warehouse. Pick it up, then run it down to the Marina Dock. Ninety seconds — the harbor crew does not wait."',
    reward: MISSION_CASH[1],
    stages: [
      { type: 'goto', target: 'warehouse', radius: 70, text: 'Pick up the package at Harbor Warehouse' },
      { type: 'timed-goto', target: 'marinaDrop', radius: 80, seconds: 90, text: 'Deliver the package to the Marina Dock' },
    ],
  },
  {
    contact: 'Lena',
    title: 'Pier Brawl',
    intro: 'Lena: "Three punks are shaking down my cousin on Sunset Pier. Go sort them out — fists only, keep it quiet-ish. There is a bag of their cash waiting after. Oh, and take my pistol. You will need it sooner or later."',
    reward: MISSION_CASH[2],
    stages: [
      { type: 'goto', target: 'pierEnd', radius: 90, text: 'Go to Sunset Pier' },
      { type: 'beat', count: 3, target: 'pierEnd', text: 'Deal with the three thugs — Space to punch' },
      { type: 'collect', target: 'pierEnd', radius: 60, text: 'Grab the cash bag on the pier' },
      { type: 'goto', target: 'garage', radius: 80, text: 'Bring the cash back to Rico\'s Garage' },
    ],
  },
  {
    contact: 'Rico',
    title: 'The Aurora Job',
    intro: 'Rico: "Last one, and it is the big one. A gold Aurora sports car is parked outside the Grand Bay Casino — guards, cameras, the works. Take it, and bring it to the Beach House. The whole city will be on you. Make it count."',
    reward: MISSION_CASH[3],
    stages: [
      { type: 'goto', target: 'auroraSpot', radius: 70, text: 'Get to the gold Aurora at Grand Bay Casino' },
      { type: 'steal-aurora', text: 'Steal the Aurora — press E next to it' },
      { type: 'escape', target: 'hideout', radius: 90, text: 'Escape to the Beach House with the Aurora' },
    ],
  },
];

export function createMissions(city) {
  const L = city.locations;
  let mission = 0;
  let stage = 0;
  let timer = 0;
  let beatLeft = 0;
  let storyDone = false;
  let failed = false;
  let started = false;
  /** Set when mission 3 begins, so update() hands the player a pistol on the next step. */
  let pendingPistol = false;

  function def() { return MISSION_DEFS[mission]; }
  function stageDef() { return def().stages[stage]; }
  function targetOf(stageDef) {
    if (!stageDef.target) return null;
    const loc = L[stageDef.target];
    return { x: loc.x, y: loc.y, label: loc.label };
  }

  return {
    get mission() { return mission; },
    get stage() { return stage; },
    get storyDone() { return storyDone; },
    get failed() { return failed; },
    get started() { return started; },
    /** Start (or restart) mission `index` from its first stage. */
    start(index) {
      mission = Math.min(index, MISSION_DEFS.length - 1);
      stage = 0;
      timer = 0;
      beatLeft = 0;
      failed = false;
      started = true;
      if (mission === 2) pendingPistol = true;
      return {};
    },
    /** After a bust or a waste: the same mission again, from its first stage. */
    retry() {
      stage = 0;
      timer = 0;
      beatLeft = 0;
      failed = false;
    },
    /** Restore saved progress: mission index, and whether the story is already done. */
    restore(index, done) {
      mission = Math.max(0, Math.min(index, MISSION_DEFS.length - 1));
      stage = 0;
      timer = 0;
      beatLeft = 0;
      failed = false;
      started = true;
      storyDone = done;
      if (index >= 2 && !done) pendingPistol = true;
    },
    /** Hide the objective card (staged scenes that are not a mission). */
    hide() {
      started = false;
    },
    /** Current objective for the HUD: text, target, timer, contact and title. */
    objective(px, py) {
      if (!started || storyDone) return null;
      const s = stageDef();
      const target = targetOf(s);
      const out = { contact: def().contact, title: def().title, text: s.text, target, timer: null, progress: null };
      if (target) out.distance = Math.round(Math.hypot(target.x - px, target.y - py));
      if (s.type === 'timed-goto') out.timer = Math.max(0, timer);
      if (s.type === 'beat') out.progress = `${MISSION_DEFS[mission].stages[stage].count - beatLeft}/${MISSION_DEFS[mission].stages[stage].count}`;
      return out;
    },
    intro() { return def().intro; },
    /** Advance one step. `ctx` carries what the world knows; the return says what changed. */
    update(dt, ctx) {
      const events = {};
      if (!started || storyDone || failed) return events;
      if (pendingPistol) { events.givePistol = true; pendingPistol = false; }
      const s = stageDef();
      const near = (target, radius) => Math.hypot(ctx.px - target.x, ctx.py - target.y) < radius;
      const advance = () => {
        stage += 1;
        timer = 0;
        if (stage >= def().stages.length) {
          events.completed = true;
          events.reward = def().reward;
          mission += 1;
          if (mission >= MISSION_DEFS.length) {
            storyDone = true;
          } else {
            stage = 0;
            if (mission === 2) events.givePistol = true;
          }
        } else if (def().stages[stage].type === 'timed-goto') {
          timer = def().stages[stage].seconds;
        }
      };
      if (s.type === 'steal') {
        if (ctx.enteredCar) advance();
      } else if (s.type === 'steal-aurora') {
        if (ctx.enteredAurora) {
          events.setWanted = 3;
          advance();
        }
      } else if (s.type === 'goto' || s.type === 'collect' || s.type === 'pickup') {
        const target = targetOf(s);
        if (near(target, s.radius)) {
          if (s.type === 'goto' && mission === 1 && stage === 0) events.addHeat = 1;
          if (s.type === 'goto' && mission === 2 && stage === 0) {
            events.spawnThugs = [
              { x: L.pierEnd.x + 60, y: L.pierEnd.y - 20 },
              { x: L.pierEnd.x + 40, y: L.pierEnd.y + 30 },
              { x: L.pierEnd.x + 90, y: L.pierEnd.y + 10 },
            ];
            beatLeft = 3;
          }
          if (s.type === 'goto' && mission === 3 && stage === 0) {
            events.spawnAurora = true;
            events.spawnThugs = [
              { x: L.auroraSpot.x - 70, y: L.auroraSpot.y - 40 },
              { x: L.auroraSpot.x + 70, y: L.auroraSpot.y + 20 },
            ];
          }
          advance();
        }
      } else if (s.type === 'timed-goto') {
        timer -= dt;
        const target = targetOf(s);
        if (near(target, s.radius)) advance();
        else if (timer <= 0) {
          failed = true;
          events.failed = true;
        }
      } else if (s.type === 'beat') {
        beatLeft = ctx.thugsAlive;
        if (beatLeft === 0) {
          events.spawnCash = { x: L.pierEnd.x + 30, y: L.pierEnd.y };
          advance();
        }
      } else if (s.type === 'escape') {
        const target = targetOf(s);
        if (near(target, s.radius) && ctx.inAurora) advance();
      }
      return events;
    },
  };
}
