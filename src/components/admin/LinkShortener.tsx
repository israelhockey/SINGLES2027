import { useCallback, useEffect, useState, type FormEvent } from "react";

import { deleteShortLink, listShortLinks, saveShortLinks } from "@/forms/api";
import { ALIAS_RE } from "@/forms/links";
import { createTinyLink, type ShortenResult } from "@/forms/shorten";
import { CopyLink } from "./FormsHome";
import { fmtDate, useT } from "./shared";

/*
 * Tiny links are kept in the database (table short_links) so every admin sees the same
 * list on every device. Before "database update part 3" is applied, the list falls back
 * to this browser only; once the update is in, those local links are copied up once.
 */
type Made = { id?: string; shortUrl: string; alias: string; target: string; createdAt: string };
const HISTORY_KEY = "s27-tiny-history";
const IMPORTED_KEY = "s27-tiny-imported";

function readHistory(): Made[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as Made[];
  } catch {
    return [];
  }
}
function writeHistory(list: Made[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* storage unavailable: the list just won't be remembered */
  }
}

/** Remembers a tiny link in the shared list (silently skipped before the update). */
export async function rememberTinyLink(m: Omit<Made, "id">) {
  try {
    const ok = await saveShortLinks([
      { short_url: m.shortUrl, alias: m.alias, target: m.target, created_at: m.createdAt },
    ]);
    if (!ok) writeHistory([m, ...readHistory().filter((h) => h.shortUrl !== m.shortUrl)]);
  } catch (e) {
    console.warn("couldn't save tiny link", e);
  }
}

/** Accepts "example.com/page" as well as full addresses. */
function normalizeUrl(raw: string) {
  const s = raw.trim();
  if (!s) return "";
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    return u.hostname.includes(".") ? u.href : "";
  } catch {
    return "";
  }
}

export function useTinyErrors() {
  const t = useT();
  return (reason: Exclude<ShortenResult, { ok: true }>["reason"]) =>
    ({
      taken: t(
        "השם הזה כבר תפוס ב-is.gd. נסו שם אחר, למשל עם השנה בסוף.",
        "That name is taken on is.gd. Try another, e.g. add the year.",
      ),
      invalid: t(
        "is.gd לא קיבל את השם או הכתובת. בדקו את הקישור ונסו שוב.",
        "is.gd didn't accept the name or address. Check the link and try again.",
      ),
      busy: t(
        "is.gd עמוס כרגע. נסו שוב בעוד דקה.",
        "is.gd is busy right now. Try again in a minute.",
      ),
      unavailable: t(
        "לא הצלחנו להגיע ל-is.gd. נסו שוב בעוד רגע.",
        "Couldn't reach is.gd. Try again in a moment.",
      ),
      forbidden: t("רק מנהלים יכולים ליצור קישורים קצרים.", "Only admins can create tiny links."),
    })[reason];
}

/** "Shorten any link": paste an address, pick a name, get is.gd/<name>. */
export function LinkShortener() {
  const t = useT();
  const errText = useTinyErrors();
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [history, setHistory] = useState<Made[]>([]);
  /** true = shared list in the database; false = this device only (before the update) */
  const [shared, setShared] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      let rows = await listShortLinks();
      if (rows === null) {
        setShared(false);
        setHistory(readHistory());
        return;
      }
      // One time: copy links made on this device before the shared list existed.
      let imported = false;
      try {
        imported = localStorage.getItem(IMPORTED_KEY) === "1";
      } catch {
        imported = true;
      }
      const local = imported ? [] : readHistory();
      if (local.length) {
        await saveShortLinks(
          local.map((h) => ({
            short_url: h.shortUrl,
            alias: h.alias,
            target: h.target,
            created_at: h.createdAt,
          })),
        );
        rows = (await listShortLinks()) ?? rows;
      }
      try {
        localStorage.setItem(IMPORTED_KEY, "1");
      } catch {
        /* ignore */
      }
      setShared(true);
      setHistory(
        rows.map((r) => ({
          id: r.id,
          shortUrl: r.short_url,
          alias: r.alias,
          target: r.target,
          createdAt: r.created_at,
        })),
      );
    } catch (e) {
      console.error(e);
      setShared(false);
      setHistory(readHistory());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = normalizeUrl(url);
    if (!target) {
      setMsg({
        kind: "err",
        text: t(
          "הדביקו קישור תקין, למשל https://example.com/page",
          "Paste a valid link, e.g. https://example.com/page",
        ),
      });
      return;
    }
    if (!ALIAS_RE.test(alias)) {
      setMsg({
        kind: "err",
        text: t(
          "שם לקישור: 5–30 תווים, אותיות באנגלית, מספרים או קו תחתון (_).",
          "Link name: 5–30 characters, English letters, numbers or underscore (_).",
        ),
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await createTinyLink({ data: { url: target, alias } });
      if (res.ok) {
        const item: Made = {
          shortUrl: res.shortUrl,
          alias,
          target,
          createdAt: new Date().toISOString(),
        };
        setMade(item);
        if (shared) {
          await rememberTinyLink(item);
          await load();
        } else {
          const next = [item, ...history.filter((h) => h.shortUrl !== item.shortUrl)];
          setHistory(next);
          writeHistory(next);
        }
        setUrl("");
        setAlias("");
      } else {
        setMsg({ kind: "err", text: errText(res.reason) });
      }
    } catch (err) {
      console.error(err);
      setMsg({
        kind: "err",
        text: t("יצירת הקישור נכשלה. נסו שוב.", "Creating the link failed. Try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (h: Made) => {
    const next = history.filter((x) => x.shortUrl !== h.shortUrl);
    setHistory(next);
    if (h.id) {
      try {
        await deleteShortLink(h.id);
      } catch (e) {
        console.error(e);
        load();
      }
    } else writeHistory(next);
  };

  return (
    <section className="card shortener" aria-labelledby="sh-title">
      <div className="sh-head">
        <h2 id="sh-title">{t("קיצור קישור", "Shorten a link")}</h2>
        <p className="small muted">
          {t(
            "מדביקים כל קישור, בוחרים שם, ומקבלים קישור קצר כמו is.gd/singles2027. חינם, דרך is.gd.",
            "Paste any link, pick a name, and get a tiny link like is.gd/singles2027. Free, via is.gd.",
          )}
        </p>
      </div>
      <form className="sh-form" onSubmit={submit} noValidate>
        <label className="sh-url">
          <span className="lbl">{t("הקישור המקורי", "Original link")}</span>
          <input
            dir="ltr"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="sh-alias">
          <span className="lbl">{t("השם לקישור הקצר", "Tiny link name")}</span>
          <div className="slug-row">
            <span className="slug-base" dir="ltr">
              is.gd/
            </span>
            <input
              dir="ltr"
              placeholder="singles2027"
              value={alias}
              onChange={(e) =>
                setAlias(e.target.value.replace(/[\s-]+/g, "_").replace(/[^A-Za-z0-9_]/g, ""))
              }
            />
          </div>
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? t("יוצר…", "Creating…") : t("יצירת קישור קצר", "Make tiny link")}
        </button>
      </form>
      {msg && (
        <p className={`msg ${msg.kind}`} role="status">
          {msg.text}
        </p>
      )}
      {made && (
        <div className="sh-made" role="status">
          <span className="small muted">{t("הקישור הקצר מוכן ✓", "Tiny link ready ✓")}</span>
          <a
            href={made.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="tiny-url"
          >
            {made.shortUrl.replace(/^https?:\/\//, "")}
          </a>
          <CopyLink url={made.shortUrl} label={t("העתקה", "Copy")} />
        </div>
      )}
      {history.length > 0 && (
        <details className="sh-history">
          <summary>
            {shared
              ? t(`כל הקישורים הקצרים (${history.length})`, `All tiny links (${history.length})`)
              : t(
                  `קישורים שיצרתם במכשיר הזה (${history.length})`,
                  `Links you made on this device (${history.length})`,
                )}
          </summary>
          <ul>
            {history.map((h) => (
              <li key={h.shortUrl}>
                <div className="sh-row-main">
                  <a
                    href={h.shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="tiny-url"
                  >
                    {h.shortUrl.replace(/^https?:\/\//, "")}
                  </a>
                  <span className="small muted sh-target" dir="ltr" title={h.target}>
                    → {h.target.replace(/^https?:\/\//, "")}
                  </span>
                  <span className="small muted">{fmtDate(h.createdAt)}</span>
                </div>
                <div className="sh-row-actions">
                  <CopyLink url={h.shortUrl} label={t("העתקה", "Copy")} />
                  <a
                    className="btn"
                    href={`https://is.gd/stats.php?url=${encodeURIComponent(h.alias)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("כמה לחצו", "Clicks")}
                  </a>
                  <button className="link subtle" type="button" onClick={() => remove(h)}>
                    {t("הסרה מהרשימה", "Remove from list")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="small muted">
        {t(
          "קישור קצר הוא קבוע: אי אפשר לשנות לאן הוא מוביל או למחוק אותו. ״הסרה מהרשימה״ רק מסתירה אותו כאן.",
          "Tiny links are permanent: where they lead can't be changed and they can't be deleted. \"Remove from list\" only hides it here.",
        )}
        {shared
          ? t(
              " הרשימה משותפת: כל מי שנכנס לניהול רואה אותה, מכל מכשיר. כולל קישורים קצרים שנוצרו לטפסים.",
              " The list is shared: everyone in the admin sees it on any device, including tiny links made for forms.",
            )
          : ""}
      </p>
    </section>
  );
}
