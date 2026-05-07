"use client";

import { useEffect, useRef } from "react";

/**
 * TetrisSnake — canvas walker animation for the pricing frame.
 * Pauses when offscreen (IntersectionObserver).
 * Honors prefers-reduced-motion.
 */
export function TetrisSnake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect reduced motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let visible = true;
    let animFrame: number;

    // Resize canvas to parent
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();

    // Simple walker state
    const cellSize = 6;
    const gap = 2;
    const step = cellSize + gap;
    let x = 0;
    let y = 0;
    let dx = 1;
    let dy = 0;
    const trail: { x: number; y: number }[] = [];
    const maxTrail = 40;
    let frame = 0;

    const brand = getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim() || "#7A1B1B";

    const draw = () => {
      if (!visible) {
        animFrame = requestAnimationFrame(draw);
        return;
      }

      frame++;
      if (frame % 3 !== 0) {
        animFrame = requestAnimationFrame(draw);
        return;
      }

      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      // Move
      x += dx * step;
      y += dy * step;

      // Bounce + random turn
      if (x >= w || x < 0 || y >= h || y < 0 || Math.random() < 0.15) {
        x = Math.max(0, Math.min(x, w - step));
        y = Math.max(0, Math.min(y, h - step));
        const dirs = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
        ].filter(([ndx, ndy]) => !(ndx === -dx && ndy === -dy));
        const [ndx, ndy] = dirs[Math.floor(Math.random() * dirs.length)];
        dx = ndx;
        dy = ndy;
      }

      trail.push({ x, y });
      if (trail.length > maxTrail) trail.shift();

      // Draw trail
      trail.forEach((p, i) => {
        const alpha = (i / trail.length) * 0.35;
        ctx.fillStyle = `color-mix(in oklch, ${brand} ${Math.round(alpha * 100)}%, transparent)`;
        ctx.fillRect(p.x, p.y, cellSize, cellSize);
      });

      // Draw head
      ctx.fillStyle = brand;
      ctx.fillRect(x, y, cellSize, cellSize);

      animFrame = requestAnimationFrame(draw);
    };

    // IntersectionObserver — pause when offscreen
    const observer = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0.1 },
    );
    observer.observe(canvas);

    animFrame = requestAnimationFrame(draw);

    const onResize = () => {
      resize();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
