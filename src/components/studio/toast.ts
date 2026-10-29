import gsap from "gsap";

let timer: ReturnType<typeof setTimeout> | undefined;

// The same bottom toast as the design. Any screen can call it; the element lives in the shell.
export function toast(message: string) {
  const el = document.getElementById("toast");
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const D = (x: number) => (reduce ? 0 : x);
  el.textContent = message;
  gsap.killTweensOf(el);
  gsap.to(el, { opacity: 1, y: 0, duration: D(0.2) });
  clearTimeout(timer);
  timer = setTimeout(() => gsap.to(el, { opacity: 0, y: 32, duration: D(0.2) }), 2600);
}
