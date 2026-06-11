"use client";

import { useEffect, useRef, useState } from "react";
import { LoginForm } from "@/components/LoginForm";
import styles from "./landing.module.css";

const FLOATING_PHRASES = [
  { text: "SOLANA TRADING BOT", x: 8, y: 14, delay: 0, duration: 9, size: "Lg", hue: "Cyan" },
  { text: "KOL WALLET DISCOVER", x: 72, y: 11, delay: 1.2, duration: 11, size: "Md", hue: "Purple" },
  { text: "SOCIAL MEDIA ALPHA", x: 78, y: 38, delay: 2.4, duration: 10, size: "Sm", hue: "Green" },
  { text: "ON-CHAIN INTEL", x: 6, y: 42, delay: 0.8, duration: 12, size: "Sm", hue: "Blue" },
  { text: "SMART MONEY TRACK", x: 85, y: 62, delay: 3.1, duration: 9, size: "Md", hue: "Cyan" },
  { text: "COPY TRADE ENGINE", x: 4, y: 68, delay: 1.8, duration: 11, size: "Md", hue: "Purple" },
  { text: "MEME COIN RADAR", x: 68, y: 78, delay: 4.2, duration: 10, size: "Lg", hue: "Green" },
  { text: "WALLET SEED SCAN", x: 22, y: 88, delay: 2.9, duration: 13, size: "Sm", hue: "Cyan" },
  { text: "KOL FEED ANALYSIS", x: 88, y: 24, delay: 5.0, duration: 12, size: "Sm", hue: "Blue" },
  { text: "TRENCHES MONITOR", x: 14, y: 28, delay: 3.6, duration: 10, size: "Xs", hue: "Purple" },
  { text: "GMGN ALPHA STREAM", x: 52, y: 8, delay: 6.1, duration: 14, size: "Xs", hue: "Green" },
  { text: "X MENTION PARSER", x: 38, y: 72, delay: 4.8, duration: 11, size: "Xs", hue: "Cyan" },
] as const;

const TICKER = [
  "SOLANA",
  "KOL DISCOVER",
  "WALLET INTEL",
  "SOCIAL ALPHA",
  "COPY TRADE",
  "SMART MONEY",
  "ON-CHAIN",
];

const PHRASE_SIZE: Record<string, string> = {
  Xs: styles.phraseXs,
  Sm: styles.phraseSm,
  Md: styles.phraseMd,
  Lg: styles.phraseLg,
};
const PHRASE_HUE: Record<string, string> = {
  Cyan: styles.phraseCyan,
  Purple: styles.phrasePurple,
  Green: styles.phraseGreen,
  Blue: styles.phraseBlue,
};

export function LandingExperience() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      setMouse({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const orbX = (mouse.x - 0.5) * 24;
  const orbY = (mouse.y - 0.5) * 24;

  return (
    <div ref={containerRef} className={styles.root}>
      <div className={`${styles.orbWrap} ${styles.orbWrap1}`} style={{ transform: `translate(${orbX}px, ${orbY}px)` }}>
        <div className={`${styles.orb} ${styles.orb1}`} />
      </div>
      <div className={`${styles.orbWrap} ${styles.orbWrap2}`} style={{ transform: `translate(${-orbX * 0.6}px, ${-orbY * 0.6}px)` }}>
        <div className={`${styles.orb} ${styles.orb2}`} />
      </div>
      <div className={`${styles.orbWrap} ${styles.orbWrap3}`} style={{ transform: `translate(${orbX * 0.4}px, ${orbY * 1.2}px)` }}>
        <div className={`${styles.orb} ${styles.orb3}`} />
      </div>

      <div className={styles.grid} aria-hidden />
      <div className={styles.scanlines} aria-hidden />
      <div className={styles.noise} aria-hidden />

      {mounted &&
        FLOATING_PHRASES.map((phrase, i) => (
          <span
            key={i}
            className={`${styles.phrase} ${PHRASE_SIZE[phrase.size]} ${PHRASE_HUE[phrase.hue]}`}
            style={{
              left: `${phrase.x}%`,
              top: `${phrase.y}%`,
              animationDuration: `${phrase.duration}s`,
              animationDelay: `${phrase.delay}s`,
            }}
          >
            {phrase.text}
          </span>
        ))}

      <div className={styles.tickerWrap} aria-hidden>
        <div className={styles.ticker}>
          {[...TICKER, ...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className={styles.tickerItem}>
              <span className={styles.tickerDot} />
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        <div className={`${styles.hero} ${mounted ? styles.heroIn : ""}`}>
          <div className={styles.badge}>
            <span className={styles.badgePulse} />
            LIVE TERMINAL
          </div>

          <h1 className={styles.title}>
            <span className={styles.titleLine}>Litt</span>
            <span className={styles.titleAccent}>Analyzer</span>
          </h1>

          <p className={styles.subtitle}>
            Solana trading bot · KOL wallet discover · social media analysis
          </p>

          <div className={styles.tags}>
            {["Wallet Intel", "KOL Feed", "Copy Trade", "Smart Money"].map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className={`${styles.loginWrap} ${mounted ? styles.loginWrapIn : ""}`}>
          <div className={styles.loginGlow} aria-hidden />
          <LoginForm variant="landing" />
        </div>

        <p className={styles.footer}>Authorized access only</p>
      </div>
    </div>
  );
}
