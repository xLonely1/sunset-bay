// Every tuning number and colour in one place. Sunset Bay is one fixed world, 3200x2400,
// drawn once to an offscreen layer; nothing here depends on the screen size.
export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Avenues run north-south, streets east-west; roads are corridors of this width. */
export const ROADS = {
  avenues: [400, 1000, 1600, 2200, 2800],
  avenueWidth: 96,
  streets: [350, 800, 1250, 1700, 2100],
  streetWidth: 88,
};

/** The beach band on the west edge: water, then sand, then the beachfront strip. */
export const BEACH = { waterTo: 130, sandTo: 272 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 252,
  accel: 1500,
  health: 100,
  punchRange: 52,
  punchDamage: 30,
  punchCooldown: 0.38,
  shootCooldown: 0.26,
  bulletDamage: 34,
  bulletSpeed: 760,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 430,
  brake: 760,
  reverseMax: 150,
  drag: 0.55,
  turnRate: 2.7,
  /** Top speed by body type, px/s. */
  topSpeed: { sedan: 385, taxi: 400, truck: 305, sport: 520, police: 475 },
  colors: ['#d94f3d', '#3d7ab8', '#e8e6df', '#2b2e33', '#2fa39a', '#e07b39', '#d97a9a', '#7a6fb5'],
};

export const TRAFFIC = { cars: 14, parked: 12, cruiseMin: 95, cruiseMax: 150, followGap: 74 };
export const PEDS = { count: 26, walkMin: 32, walkMax: 58, fleeSpeed: 96 };

export const POLICE = {
  footSpeed: 168,
  footHealth: 50,
  punchDamage: 7,
  punchRange: 40,
  punchCooldown: 0.9,
  bustTime: 1.25,
  maxCars: 6,
};

export const THUG = { health: 60, speed: 128, punchDamage: 4, punchRange: 42, punchCooldown: 1.8 };

/** Wanted stars: heat added per crime, one star lost after this long quiet. */
export const WANTED = {
  max: 5,
  decaySeconds: 12,
  heat: { steal: 1, hitPed: 1, hitPolice: 1, shoot: 1, runOver: 1 },
};

/** Cash rewards per mission, in dollars. */
export const MISSION_CASH = [500, 800, 1200, 2500];

export const PALETTE = {
  backdrop: '#1c2433',
  waterDeep: '#1d5a76',
  waterShallow: '#5fb2c9',
  sand: '#e8c98f',
  sandWet: '#d9b878',
  grass: '#7fae62',
  parkPath: '#d9c9a3',
  pond: '#5fa8c4',
  block: '#a39a80',
  sidewalk: '#c2b99e',
  road: '#3a3f4a',
  roadEdge: '#d8d2c4',
  roadDash: '#e8e0c8',
  crosswalk: '#e8e4d8',
  plaza: '#b7ab8d',
  building: ['#d98a6a', '#e8b04b', '#c96f5e', '#7a9bb5', '#b56576', '#e5d3a8', '#8fa98f', '#d9c07a', '#a87fb5'],
  tree: ['#4e7d3a', '#6a9a4a', '#3f6b32'],
  palm: '#3e7a34',
  player: '#2fa39a',
  playerDark: '#1e3a4a',
  police: '#24365e',
  policeCar: '#e8e6df',
  thug: '#8a2f2f',
  hudPanel: 'rgba(14, 18, 28, 0.72)',
  hudText: '#f5efe2',
  hudMuted: '#c9bfa5',
  accent: '#ffb347',
  star: '#ffd23d',
  health: '#58c96b',
  healthLow: '#e5534b',
  waypoint: '#ffcf3d',
  cash: '#8fd97a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'sunset-bay.save.v1';
