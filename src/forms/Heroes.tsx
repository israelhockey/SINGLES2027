import { useEffect, useRef, type ReactNode } from "react";

import type { FormTexts, TemplateId } from "./types";

/** "**bold**" -> highlighted text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <span key={i}>{p}</span>))}</>;
}

const cityList = (s: string) =>
  s
    .split(/[,،·\n]/)
    .map((c) => c.trim())
    .filter(Boolean);

function Heart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.5 1.2 4.3 2.4.8-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

function Lead({ t }: { t: FormTexts }) {
  return t.lead ? (
    <p className="lead">
      <RichText text={t.lead} />
    </p>
  ) : null;
}

function Note({ t }: { t: FormTexts }) {
  return t.citiesNote ? <p className="cnote">{t.citiesNote}</p> : null;
}

/* ---------- מכתב אהבה ---------- */
function LetterHero({ t }: { t: FormTexts }) {
  const cities = cityList(t.cities);
  return (
    <header className="hero">
      <div
        className="env"
        role="img"
        aria-label={[t.kicker, t.headline, t.year].filter(Boolean).join(" ")}
      >
        <div className="back" />
        <div className="paper">
          {t.kicker && <div className="to">{t.kicker}</div>}
          {t.headline && <div className="big">{t.headline}</div>}
          {t.year && <div className="yr">{t.year}</div>}
        </div>
        <div className="front" />
        <div className="seal" aria-hidden="true">
          <Heart />
        </div>
      </div>
      {t.title && <h1>{t.title}</h1>}
      <Lead t={t} />
      {cities.length > 0 && <p className="cities">{cities.join(" · ")}</p>}
      <Note t={t} />
    </header>
  );
}

function LetterIntro({ t }: { t: FormTexts }) {
  if (!t.introTitle && !t.introText) return null;
  return (
    <section className="intro">
      {t.introTitle && <h2>{t.introTitle}</h2>}
      {t.introText && <p>{t.introText}</p>}
    </section>
  );
}

/* ---------- יש התאמה ---------- */
function MatchHero({ t }: { t: FormTexts }) {
  const cities = cityList(t.cities);
  return (
    <header className="hero">
      <div className="stage" aria-hidden="true">
        <span className="dot d1" />
        <span className="dot d2" />
        <span className="dot d3" />
        <span className="dot d4" />
        <div className="pc a">
          <div className="ph" />
          <b>
            הקהילה שלכם<small>מחכה לכם</small>
          </b>
        </div>
        <div className="pc b">
          <div className="ph" />
          <b>
            האירוע<small>{t.year || "בקרוב"}</small>
          </b>
        </div>
        <div className="badge">
          <Heart />
        </div>
      </div>
      {t.headline && <p className="match">{t.headline}</p>}
      {t.title && (
        <h1>
          {t.title} {t.year && <span>{t.year}</span>}
        </h1>
      )}
      <Lead t={t} />
      {cities.length > 0 && (
        <div className="cities">
          {cities.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      <Note t={t} />
    </header>
  );
}

function MatchIntro({ t }: { t: FormTexts }) {
  if (!t.introTitle && !t.introText && !t.kicker) return null;
  return (
    <section className="intro chat">
      {t.introTitle && <div className="bub them">{t.introTitle}</div>}
      {t.kicker && <div className="bub me">{t.kicker}</div>}
      {t.introText && <div className="bub them">{t.introText}</div>}
    </section>
  );
}

/* ---------- ורוד פודרה ---------- */
function Hearts() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const x = c.getContext("2d");
    if (!x) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let raf = 0;
    const resize = () => {
      const r = c.getBoundingClientRect();
      W = r.width;
      H = r.height;
      c.width = W * dpr;
      c.height = H * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const color = getComputedStyle(c).color || "#d9668a";
    const P = Array.from({ length: 16 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      s: 0.8 + Math.random() * 1.4,
      v: 0.15 + Math.random() * 0.35,
      w: Math.random() * 6.28,
      a: 0.12 + Math.random() * 0.25,
    }));
    const draw = () => {
      x.clearRect(0, 0, W, H);
      x.fillStyle = color;
      for (const p of P) {
        p.y -= p.v;
        p.w += 0.01;
        if (p.y < -20) {
          p.y = H + 20;
          p.x = Math.random() * W;
        }
        x.save();
        x.translate(p.x + Math.sin(p.w) * 14, p.y);
        x.scale(p.s, p.s);
        x.globalAlpha = p.a;
        x.beginPath();
        x.moveTo(0, 3);
        x.bezierCurveTo(-6, -2, -3, -7, 0, -4);
        x.bezierCurveTo(3, -7, 6, -2, 0, 3);
        x.fill();
        x.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas className="hearts" ref={ref} aria-hidden="true" />;
}

function BlushHero({ t }: { t: FormTexts }) {
  const cities = cityList(t.cities);
  return (
    <header className="hero">
      <div className="orn" aria-hidden="true">
        <Heart />
      </div>
      {t.kicker && <p className="pre">{t.kicker}</p>}
      {t.headline && <h1>{t.headline}</h1>}
      {t.year && <div className="year">{t.year}</div>}
      {t.title && <p className="pre ttl">{t.title}</p>}
      <Lead t={t} />
      {cities.length > 0 && (
        <div className="cities">
          {cities.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      )}
      <Note t={t} />
    </header>
  );
}

function BlushIntro({ t }: { t: FormTexts }) {
  if (!t.introTitle && !t.introText) return null;
  return (
    <section className="intro card-intro">
      {t.introTitle && <h2>{t.introTitle}</h2>}
      {t.introText && <p>{t.introText}</p>}
    </section>
  );
}

export function Hero({ template, t }: { template: TemplateId; t: FormTexts }) {
  if (template === "match") return <MatchHero t={t} />;
  if (template === "blush") return <BlushHero t={t} />;
  return <LetterHero t={t} />;
}

export function Intro({ template, t }: { template: TemplateId; t: FormTexts }) {
  if (template === "match") return <MatchIntro t={t} />;
  if (template === "blush") return <BlushIntro t={t} />;
  return <LetterIntro t={t} />;
}

export function Backdrop({ template }: { template: TemplateId }): ReactNode {
  return template === "blush" ? <Hearts /> : null;
}
