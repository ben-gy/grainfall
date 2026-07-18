/**
 * particles.ts — the only canvas in the game: a fixed background layer of drifting
 * grain motes plus short bursts anchored to HUD elements (a shower of grain on the
 * harvest, a dark scatter for rats, grey for plague). Respects reduced-motion.
 */

export interface BurstOpts {
  count?: number;
  color?: string;
  spread?: number;
  up?: boolean;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
  drift: boolean;
}

export class Particles {
  private ctx: CanvasRenderingContext2D;
  private motes: Mote[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private reduced: boolean;
  private ambientTimer = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.last = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return; // guard transient 0-size
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private spawnAmbient(): void {
    if (this.reduced) return;
    this.motes.push({
      x: Math.random() * this.w,
      y: -6,
      vx: (Math.random() - 0.5) * 8,
      vy: 12 + Math.random() * 16,
      r: 1 + Math.random() * 1.6,
      life: 0,
      maxLife: 8 + Math.random() * 6,
      color: Math.random() < 0.5 ? '#e0a94b' : '#8a6d3a',
      drift: true,
    });
  }

  /** A burst of particles at a screen position (element-anchored). */
  burst(x: number, y: number, opts: BurstOpts = {}): void {
    if (this.reduced) return;
    const count = opts.count ?? 20;
    const color = opts.color ?? '#e0a94b';
    const spread = opts.spread ?? 120;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      this.motes.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: (opts.up ? -Math.abs(Math.sin(a)) : Math.sin(a)) * sp - (opts.up ? 40 : 0),
        r: 1.5 + Math.random() * 2.2,
        life: 0,
        maxLife: 0.7 + Math.random() * 0.6,
        color,
        drift: false,
      });
    }
  }

  /** Burst centred on a DOM element. */
  burstEl(el: Element | null, opts?: BurstOpts): void {
    if (!el) return;
    const r = el.getBoundingClientRect();
    this.burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  }

  private frame(t: number): void {
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0.016;
    this.last = t;
    this.ambientTimer += dt;
    const ambientEvery = 0.28;
    while (this.ambientTimer > ambientEvery) {
      this.ambientTimer -= ambientEvery;
      if (this.motes.length < 90) this.spawnAmbient();
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (!m.drift) {
        m.vy += 220 * dt; // gravity for bursts
        m.vx *= 0.98;
      } else {
        m.vx += Math.sin((m.y + m.x) * 0.01) * 6 * dt;
      }
      const gone = m.drift ? m.y > this.h + 8 : m.life > m.maxLife;
      if (gone) {
        this.motes.splice(i, 1);
        continue;
      }
      const alpha = m.drift
        ? Math.min(1, m.life * 2) * 0.5
        : Math.max(0, 1 - m.life / m.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
