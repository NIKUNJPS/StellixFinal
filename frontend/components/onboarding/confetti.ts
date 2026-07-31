/**
 * Lightweight, dependency-free confetti burst (Batch 21).
 *
 * A short canvas animation over the whole viewport, then it cleans itself up. No
 * library (canvas-confetti was deliberately not added). Honors
 * prefers-reduced-motion — if the user opts out of motion, it does nothing.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
}

const COLORS = ["#0066FF", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

export function fireConfetti(durationMs = 2400, count = 140): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const particles: Particle[] = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: Math.random() * -14 - 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    size: Math.random() * 6 + 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
  }));

  const start = performance.now();
  const gravity = 0.35;

  function frame(now: number) {
    const elapsed = now - start;
    ctx!.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx!.restore();
    }
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}
