"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { memo, type ReactNode, useCallback, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Batch 25: a 3D, pointer-reactive card surface.
 *
 * Built on framer-motion motion values (already a dependency) and CSS 3D transforms —
 * no WebGL library, which PROJECT_CONSTITUTION §2's locked frontend stack does not
 * include. Pointer movement updates motion values directly on the DOM, so tilting a
 * card never re-renders React. Honours prefers-reduced-motion by rendering flat.
 *
 * `maxTilt` should stay small (≤ 4°) on cards that contain charts: Recharts maps the
 * pointer through getBoundingClientRect, and a large rotation would skew tooltip
 * hit-testing.
 */
export const TiltSurface = memo(function TiltSurface({
  children,
  className,
  maxTilt = 8,
  glare = true,
  depth = 18,
  testId,
}: {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glare?: boolean;
  depth?: number;
  testId?: string;
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [0, 1], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-maxTilt, maxTilt]), spring);
  const lift = useSpring(0, spring);
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.10), transparent 55%)`;

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      px.set((e.clientX - rect.left) / rect.width);
      py.set((e.clientY - rect.top) / rect.height);
    },
    [px, py],
  );
  const onPointerEnter = useCallback(() => lift.set(depth), [lift, depth]);
  const onPointerLeave = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
    lift.set(0);
  }, [px, py, lift]);

  if (reduceMotion) {
    return (
      <div className={className} data-testid={testId}>
        {children}
      </div>
    );
  }

  return (
    <div className="[perspective:1100px]" data-testid={testId}>
      <motion.div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={{ rotateX, rotateY, z: lift, transformStyle: "preserve-3d" }}
        className={cn("relative will-change-transform", className)}
      >
        {children}
        {glare && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ background: glareBackground }}
          />
        )}
      </motion.div>
    </div>
  );
});
