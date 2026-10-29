"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Entrance and scroll motion for the landing page. Content is fully visible without it, and under
// reduced motion nothing here runs.
export default function LandingMotion() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.set("[data-rise]", { opacity: 0, y: 28 });
      ScrollTrigger.batch("[data-rise]", {
        start: "top 92%",
        once: true,
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.08 }),
      });

      gsap.to("[data-float]", { y: -9, duration: 3.4, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.to(".lp-hero-phone", {
        y: -46,
        ease: "none",
        scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true },
      });

      gsap.to(".lp-flow", { strokeDashoffset: -28, duration: 1.4, ease: "none", repeat: -1 });
      gsap.from("[data-node]", {
        opacity: 0,
        scale: 0.96,
        transformOrigin: "50% 50%",
        duration: 0.6,
        stagger: 0.1,
        ease: "power2.out",
        scrollTrigger: { trigger: ".lp-arch", start: "top 80%", once: true },
      });
    });
    return () => ctx.revert();
  }, []);

  return null;
}
