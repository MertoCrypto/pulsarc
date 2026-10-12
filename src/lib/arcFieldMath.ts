export type Tone = readonly [number, number, number]

export const TONES: Tone[] = [
  [39, 117, 202],   // USDC blue
  [59, 123, 255],   // Arc blue
  [169, 196, 234],  // periwinkle
  [120, 196, 232],  // cyan haze
  [226, 238, 255],  // near-white
]

export const DISC = 400      // outer radius of the disc, in field units
export const ARMS = 2
export const TWIST = 1.85    // how tightly the arms wind

export interface Dust {
  r: number
  a: number      // angle at rest; the whole disc rotates on top of this
  size: number
  tone: Tone
  ring: boolean
  alpha: number
  phase: number
}

export function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
}

export function makeDust(): Dust {
  const inArm = Math.random() < 0.74
  const r = 22 + Math.pow(Math.random(), inArm ? 0.85 : 0.6) * (inArm ? DISC : DISC * 1.12)
  const arm = ((Math.random() * ARMS) | 0) * ((Math.PI * 2) / ARMS)
  const spread = inArm ? 0.2 + (r / DISC) * 0.26 : Math.PI
  const a = inArm ? arm + TWIST * Math.log(r / 22) + gauss() * spread : Math.random() * Math.PI * 2
  const ring = Math.random() < 0.05
  const nearCore = 1 - Math.min(1, r / DISC)
  return {
    r,
    a,
    size: ring ? 3 + Math.random() * 7 : 0.6 + Math.random() * 2 + nearCore * 0.6,
    // the core runs warm-white, the arms cool blue
    tone: nearCore > 0.72 && Math.random() < 0.7 ? TONES[4] : TONES[(Math.random() * TONES.length) | 0],
    ring,
    alpha: (inArm ? 0.62 : 0.28) + Math.random() * 0.38,
    phase: Math.random() * Math.PI * 2,
  }
}
