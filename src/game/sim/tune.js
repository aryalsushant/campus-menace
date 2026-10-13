// All gameplay numbers in one place.

export const STEP = 1 / 60;

export const RUN = {
  gravity: 34,
  jumpV: 11, // apex ≈ 1.78 m
  doubleJumpV: 10,
  jumpCut: 0.5, // vy multiplier when jump is released early
  fastFallV: -20, // slide pressed in the air
  coyote: 0.1,
  buffer: 0.13,
  slideTime: 0.62,
  slideCooldown: 0.12,
  latAccelGround: 46,
  latAccelAir: 30,
  latMax: base => 6.2 + base * 0.14,
  sprintMul: 1.2,
  speedAccel: 9,
  stumbleMul: 0.55,
  stumbleTime: 0.85,
  shakenTime: 4,
  scrapeMul: 0.86,
  radius: 0.34,
  heightStand: 1.75,
  heightSlide: 0.8,
  stepUp: 0.42,
  snapDown: 0.6,
  invulnAfterShield: 1.2,
};

// forward speed by distance: 10 m/s at the start, ~24 m/s far in
export const speedAt = s => 11.5 + 13 * (1 - Math.exp(-s / 1700));

// 0..1 difficulty by distance
export const difficultyAt = s => Math.min(1, s / 2400);

// stages: grounded campus → cracking → sky campus
export const STAGES = [
  { id: 'campus', from: 0, name: 'Main Campus' },
  { id: 'cracking', from: 1300, name: 'Construction Zone' },
  { id: 'sky', from: 2700, name: 'Sky Campus' },
];
export const stageAt = s => (s >= STAGES[2].from ? 2 : s >= STAGES[1].from ? 1 : 0);

// time of day 0 (morning) → 1 (sunset) → 2 (night)
export const timeOfDayAt = s => Math.min(2, s / 2200);

// air time of a single jump on flat ground, and a jump + double jump at apex
const g = RUN.gravity;
export const AIR_SINGLE = (2 * RUN.jumpV) / g;
export const AIR_DOUBLE = (() => {
  const t1 = RUN.jumpV / g; // rise to apex
  const apex = (RUN.jumpV * RUN.jumpV) / (2 * g);
  const v = RUN.doubleJumpV;
  return t1 + (v + Math.sqrt(v * v + 2 * g * apex)) / g;
})();

export const CANS = {
  start: 5,
  max: 8,
  speed: 34, // relative to the runner
  gravity: 16,
  life: 1.8,
  cooldown: 0.28,
  sixPackTime: 8,
};

export const RIDER = {
  halfDepth: 0.75,
  halfWidth: 0.4,
  closeCall: 1.3,
  leadTime: 3.4, // seconds of warning before an oncoming rider reaches you
};

export const POWER = {
  magnet: 9,
  coffee: 6,
  coffeeMul: 1.35,
  sixpack: 8,
  magnetRadius: 7,
};

export const COMBO = {
  window: 4.5,
  every: 5,
  bonus: 3,
};
