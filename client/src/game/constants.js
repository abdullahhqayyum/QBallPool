  export const TABLE = {
    width:  800,
    height: 400,
    cushionThickness: 20,
    playX1: 22,
    playX2: 778,
    playY1: 22,
    playY2: 378,
    // Extra logical space beyond the cushion where the cue stick can extend.
    // Physics boundaries stay the same — only the AIM LINE is allowed past this.
    cueAimBuffer: 60,
  }

  export const BALL = {
    radius: 11,
    friction: 0.005,
    frictionAir: 0.018,
    restitution: 0.8,
    maxSpeed: 18,
    contactSkin: 0.75,
  }

  export const POCKET = {
    radius: 28,
    positions: [
      [22,  22],
      [400, 14],
      [778, 22],
      [22,  378],
      [400, 386],
      [778, 378],
    ]
  }

  export const CUE = {
    maxPower: 18,
    aimLineLength: 240,
    dragForMaxPower: 70,
    minForce: 0.006,
    maxForce: 0.13,
    powerCurve: 0.72,
    pointerJitterPx: 3,
    pointerSmoothingAlpha: 0.4,
    releaseBlendThresholdPx: 6,
  }