import { useEffect, useRef } from 'react';

/**
 * Gradient Blob background for the login page.
 *
 * 3 large, soft blobs (teal / indigo / amber) drift and morph slowly
 * like a lava lamp. Rendered via Canvas with heavy Gaussian blur.
 * Inspired by Stripe / Linear aesthetic.
 *
 * Respects prefers-reduced-motion.
 */

/* ── Blob definition ─────────────────────────────────────────── */

interface Blob {
  x: number;  y: number;       // center (ratio 0-1 of viewport)
  r: number;                    // radius (ratio of min(w,h))
  vx: number; vy: number;      // velocity (ratio/s)
  color: [number, number, number]; // RGB
  alpha: number;
  phase: number;                // for organic shape morphing
  freq: number;                 // morph speed
}

const BLOBS: Omit<Blob, 'phase' | 'freq'>[] = [
  // Primary teal — large, dominant
  { x: 0.25, y: 0.30, r: 0.38, vx: 0.008, vy: 0.005, color: [62, 207, 174], alpha: 0.30 },
  // Indigo — medium
  { x: 0.72, y: 0.65, r: 0.32, vx: -0.006, vy: 0.007, color: [99, 102, 241], alpha: 0.22 },
  // Amber accent — small, warm highlight
  { x: 0.55, y: 0.20, r: 0.22, vx: 0.005, vy: -0.008, color: [251, 191, 36], alpha: 0.10 },
  // Secondary teal — fills gaps
  { x: 0.80, y: 0.25, r: 0.28, vx: -0.007, vy: -0.004, color: [62, 207, 174], alpha: 0.14 },
  // Deep indigo — background depth
  { x: 0.35, y: 0.75, r: 0.35, vx: 0.004, vy: -0.006, color: [79, 70, 229], alpha: 0.16 },
];

const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

/* ── Component ───────────────────────────────────────────────── */

export const NetworkCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;

    // Initialize blobs with morph params
    const blobs: Blob[] = BLOBS.map((b) => ({
      ...b,
      phase: Math.random() * Math.PI * 2,
      freq: 0.15 + Math.random() * 0.1,
    }));

    const resize = () => {
      const dpr = DPR();
      // Render at reduced resolution for performance (blur hides it)
      const scale = 0.5;
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr * scale);
      canvas.height = Math.round(h * dpr * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = mq.matches;
    const onMq = (e: MediaQueryListEvent) => { reduced = e.matches; };
    mq.addEventListener('change', onMq);

    // Mouse influence — blobs subtly attract toward cursor
    let mx = 0.5, my = 0.5; // normalized
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = (e.clientX - r.left) / w;
      my = (e.clientY - r.top) / h;
    };
    const onLeave = () => { mx = 0.5; my = 0.5; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    let time = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = 0.016;
      time += dt;

      ctx.clearRect(0, 0, w, h);

      for (const b of blobs) {
        if (!reduced) {
          // Drift
          b.x += b.vx * dt;
          b.y += b.vy * dt;

          // Soft bounce at boundaries (with padding so blobs stay partially visible)
          const pad = -0.15;
          if (b.x < pad) { b.x = pad; b.vx = Math.abs(b.vx); }
          if (b.x > 1 - pad) { b.x = 1 - pad; b.vx = -Math.abs(b.vx); }
          if (b.y < pad) { b.y = pad; b.vy = Math.abs(b.vy); }
          if (b.y > 1 - pad) { b.y = 1 - pad; b.vy = -Math.abs(b.vy); }

          // Subtle mouse attraction
          const dx = mx - b.x, dy = my - b.y;
          b.vx += dx * 0.00005;
          b.vy += dy * 0.00005;

          // Speed limit
          const speed = Math.hypot(b.vx, b.vy);
          const maxSpeed = 0.012;
          if (speed > maxSpeed) {
            b.vx = (b.vx / speed) * maxSpeed;
            b.vy = (b.vy / speed) * maxSpeed;
          }
        }

        // Organic radius morphing
        const morph = reduced ? 1 : 1 + Math.sin(time * b.freq + b.phase) * 0.08
                                      + Math.sin(time * b.freq * 1.7 + b.phase * 2) * 0.04;
        const dim = Math.min(w, h);
        const radius = b.r * dim * morph;
        const px = b.x * w;
        const py = b.y * h;

        // Draw radial gradient blob
        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        const [r, g, bl] = b.color;
        grad.addColorStop(0, `rgba(${r},${g},${bl},${b.alpha})`);
        grad.addColorStop(0.4, `rgba(${r},${g},${bl},${b.alpha * 0.5})`);
        grad.addColorStop(0.7, `rgba(${r},${g},${bl},${b.alpha * 0.15})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      mq.removeEventListener('change', onMq);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'auto',
        filter: 'blur(80px) saturate(1.5)',
      }}
    />
  );
};
