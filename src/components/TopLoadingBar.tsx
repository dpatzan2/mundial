"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function TopLoadingBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Navegar entre competencias solo cambia el query (?competition=...), no el pathname;
  // seguimos la URL completa para que finish() dispare tambien en esos casos.
  const url = `${pathname}?${searchParams}`;
  const prevPathname = useRef(url);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (tickRef.current) clearTimeout(tickRef.current);
    if (doneRef.current) clearTimeout(doneRef.current);
  }

  function startTick(current: number) {
    if (current >= 88) return;
    tickRef.current = setTimeout(() => {
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 12 + 4, 88);
        startTick(next);
        return next;
      });
    }, 380);
  }

  function begin() {
    clearTimers();
    setVisible(true);
    setProgress(16);
    startTick(16);
  }

  function finish() {
    clearTimers();
    setProgress(100);
    doneRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 350);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;
      begin();
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (url !== prevPathname.current) {
      prevPathname.current = url;
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => () => clearTimers(), []);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes tlb-shimmer {
          0%   { opacity: 0.85; }
          50%  { opacity: 1; }
          100% { opacity: 0.85; }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99999,
          height: "3px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #1a7a40, #2db55d, #7ee09a)",
            borderRadius: "0 3px 3px 0",
            boxShadow: "0 0 10px rgba(45,181,93,0.7)",
            transition:
              progress === 100
                ? "width 0.18s ease-out"
                : "width 0.38s cubic-bezier(0.4,0,0.2,1)",
            animation: "tlb-shimmer 1.2s ease-in-out infinite",
          }}
        />
      </div>
    </>
  );
}
