"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll (Batch 15, hardened in the landing redesign) — an
 * IntersectionObserver hook with a rect-based fallback. Returns a ref to attach
 * to an element and a `visible` flag that flips true once the element scrolls
 * into view (and stays true when `once`).
 *
 * Why the fallback: some embedded/preview browsers expose an
 * IntersectionObserver whose callbacks simply never fire (verified live — an
 * observer on document.body never reported its mandatory initial state). A
 * passive scroll/resize listener doing a cheap getBoundingClientRect check
 * guarantees reveals still trigger there; in real browsers the observer usually
 * wins first and both paths write the same idempotent `setVisible(true)`.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const { threshold = 0.15, rootMargin = "0px 0px -10% 0px", once = true } = options ?? {};
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let raf = 0;
    const removeFallback = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
    const show = () => {
      setVisible(true);
      if (once) {
        observer?.disconnect();
        removeFallback();
      }
    };

    // Mirrors the default rootMargin's -10% bottom inset closely enough for a
    // fallback: an element counts as visible once its top clears ~90% of the
    // viewport height and its bottom is still below the top edge.
    const rectVisible = () => {
      const r = node.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return r.height > 0 && r.top < vh * 0.9 && r.bottom > 0;
    };
    const onScrollOrResize = () => {
      if (rectVisible()) show();
    };

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              show();
            } else if (!once) {
              setVisible(false);
            }
          }
        },
        { threshold, rootMargin },
      );
      observer.observe(node);
    }

    // Fallback path (and the no-IO path): one check after layout settles, then
    // passive scroll/resize checks until visible.
    raf = requestAnimationFrame(onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    return () => {
      observer?.disconnect();
      removeFallback();
    };
  }, [threshold, rootMargin, once]);

  return { ref, visible };
}
