import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  exportTable,
  fullName,
  partnersOf,
  reachOf,
  rowToApplication,
  strList,
  type AppRow,
} from "@/lib/admin-data";
import { buildSummary } from "@/lib/application";
import { buildXlsx, downloadBlob } from "@/lib/xlsx";
import {
  Contact,
  currentLang,
  Field,
  REFRESH_MS,
  Stat,
  Tags,
  fmtDate,
  fmtN,
  readSeen,
  sameDay,
  timeAgo,
  useSignedUrl,
  useT,
  writeSeen,
} from "./shared";

type Sort = "new" | "old" | "reach" | "name";

export function LegacyDashboard({ email, embedded }: { email: string; embedded?: boolean }) {
  const t = useT();
  const [rows, setRows] = useState<AppRow[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [openId, setOpenId] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(() => readSeen());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setLoadErr(
        t(
          "טעינת הבקשות נכשלה. בדקו את החיבור ולחצו ״רענון״.",
          "Couldn't load applications. Check your connection and click “Refresh”.",
        ),
      );
      return;
    }
    setLoadErr("");
    setRows(data ?? []);
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const markSeen = useCallback((ids: string[]) => {
    setSeen((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      writeSeen(next);
      return next;
    });
  }, []);

  const cities = useMemo(
    () =>
      [...new Set((rows ?? []).map((r) => r.city.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [rows],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      if (city && r.city.trim() !== city) return false;
      if (!needle) return true;
      return [r.community_name, r.business_name, fullName(r), r.phone, r.email, r.city]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const by: Record<Sort, (a: AppRow, b: AppRow) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      old: (a, b) => a.created_at.localeCompare(b.created_at),
      reach: (a, b) => reachOf(b) - reachOf(a),
      name: (a, b) => a.community_name.localeCompare(b.community_name, "he"),
    };
    return [...list].sort(by[sort]);
  }, [rows, q, city, sort]);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const today = new Date();
    return {
      total: all.length,
      today: all.filter((r) => sameDay(new Date(r.created_at), today)).length,
      unseen: all.filter((r) => !seen.has(r.id)).length,
      reach: all.reduce((t, r) => t + reachOf(r), 0),
      cities: new Set(all.map((r) => r.city.trim()).filter(Boolean)).size,
    };
  }, [rows, seen]);

  const exportXlsx = async () => {
    if (!shown.length) return;
    setExporting(true);
    try {
      const paths = shown
        .flatMap((r) => [r.logo1_path, r.logo2_path])
        .filter((p): p is string => !!p);
      const links = new Map<string, string>();
      if (paths.length) {
        const { data } = await supabase.storage
          .from("logos")
          .createSignedUrls(paths, 60 * 60 * 24 * 7);
        data?.forEach((d) => d.path && d.signedUrl && links.set(d.path, d.signedUrl));
      }
      const { columns, data } = exportTable(shown, links);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(buildXlsx("בקשות הצטרפות", columns, data), `בקשות-הצטרפות-${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const openIndex = shown.findIndex((r) => r.id === openId);
  const openRow = openIndex >= 0 ? shown[openIndex] : null;
  const openAt = (id: string) => {
    setOpenId(id);
    markSeen([id]);
  };

  const onDeleted = (id: string) => {
    setOpenId(null);
    setRows((rs) => (rs ?? []).filter((r) => r.id !== id));
    load();
  };

  return (
    <div className="dash">
      {!embedded && (
        <header className="top">
          <div>
            <p className="eyebrow">אירוע ההכרויות הגדול של ישראל 2027</p>
            <h1>{t("בקשות הצטרפות של קהילות", "Community applications")}</h1>
          </div>
          <div className="who">
            <span dir="ltr">{email}</span>
            <button className="link" onClick={() => supabase.auth.signOut()}>
              {t("התנתקות", "Sign out")}
            </button>
          </div>
        </header>
      )}

      <section className="stats" aria-label={t("סיכום", "Summary")}>
        <Stat label={t("סך בקשות", "Total applications")} value={fmtN(stats.total)} />
        <Stat
          label={t("חדשות שלא נפתחו", "New, not opened")}
          value={fmtN(stats.unseen)}
          accent={stats.unseen > 0}
        />
        <Stat label={t("הגיעו היום", "Arrived today")} value={fmtN(stats.today)} />
        <Stat
          label={t("סך קהלים של כל הקהילות", "Total reach of all communities")}
          value={fmtN(stats.reach)}
        />
        <Stat label={t("ערים", "Cities")} value={fmtN(stats.cities)} />
      </section>

      <section className="toolbar" aria-label={t("חיפוש וסינון", "Search and filter")}>
        <input
          className="search"
          type="search"
          placeholder={t(
            "חיפוש לפי קהילה, שם, טלפון, מייל או עיר",
            "Search by community, name, phone, email or city",
          )}
          aria-label={t("חיפוש", "Search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label={t("סינון לפי עיר", "Filter by city")}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          <option value="">{t("כל הערים", "All cities")}</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label={t("מיון", "Sort")}
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="new">{t("החדשות ראשונות", "Newest first")}</option>
          <option value="old">{t("הישנות ראשונות", "Oldest first")}</option>
          <option value="reach">{t("הקהל הגדול ראשון", "Largest reach first")}</option>
          <option value="name">{t("לפי שם קהילה", "By community name")}</option>
        </select>
        <div className="spacer" />
        <button
          className="btn"
          onClick={load}
          title={t(
            "הרשימה מתרעננת לבד כל 30 שניות",
            "The list refreshes by itself every 30 seconds",
          )}
        >
          ↻ {t("רענון", "Refresh")}
          {updatedAt && <span className="small">{timeAgo(updatedAt, now)}</span>}
        </button>
        <button className="btn primary" onClick={exportXlsx} disabled={!shown.length || exporting}>
          {exporting
            ? t("מכין קובץ…", "Preparing file…")
            : `${t("ייצוא לאקסל", "Export to Excel")} (${shown.length})`}
        </button>
      </section>

      {stats.unseen > 0 && (
        <p className="newbar">
          {t(
            `יש ${stats.unseen === 1 ? "בקשה חדשה אחת" : `${stats.unseen} בקשות חדשות`} שעוד לא נפתחו.`,
            `${stats.unseen === 1 ? "1 new application hasn't" : `${stats.unseen} new applications haven't`} been opened yet.`,
          )}
          <button className="link" onClick={() => markSeen((rows ?? []).map((r) => r.id))}>
            {t("סימון הכל כנקרא", "Mark all as read")}
          </button>
        </p>
      )}

      {loadErr && <p className="msg err">{loadErr}</p>}
      {!rows && !loadErr && (
        <p className="center muted">{t("טוען בקשות…", "Loading applications…")}</p>
      )}

      {rows && rows.length === 0 && (
        <div className="card empty">
          <h2>{t("עוד אין בקשות", "No applications yet")}</h2>
          <p className="muted">
            {t(
              "ברגע שמנהלי קהילות ימלאו את הטופס, הבקשות יופיעו כאן. הדף מתרענן לבד כל 30 שניות.",
              "Once community managers fill in the form, applications will appear here. The page refreshes every 30 seconds.",
            )}
          </p>
        </div>
      )}

      {rows && rows.length > 0 && shown.length === 0 && (
        <p className="center muted">
          {t("אין בקשות שמתאימות לחיפוש.", "No applications match your search.")}
        </p>
      )}

      {shown.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("לוגו", "Logo")}</th>
                  <th>{t("קהילה", "Community")}</th>
                  <th>{t("איש/אשת קשר", "Contact")}</th>
                  <th>{t("טלפון", "Phone")}</th>
                  <th>{t("עיר", "City")}</th>
                  <th>{t("סך קהלים", "Total reach")}</th>
                  <th>{t("נשלח", "Submitted")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => openAt(r.id)}
                    onKeyDown={(e) => e.key === "Enter" && openAt(r.id)}
                    className={seen.has(r.id) ? "" : "unseen"}
                  >
                    <td>
                      <Logo path={r.logo1_path} size={40} />
                    </td>
                    <td>
                      <b>{r.community_name}</b>
                      {!seen.has(r.id) && <span className="badge">חדש</span>}
                      <div className="small muted">{r.business_name}</div>
                    </td>
                    <td>{fullName(r)}</td>
                    <td dir="ltr" className="num">
                      {r.phone}
                    </td>
                    <td>{r.city}</td>
                    <td className="num">{fmtN(reachOf(r))}</td>
                    <td className="small">{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="cards">
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  className={`rowcard${seen.has(r.id) ? "" : " unseen"}`}
                  onClick={() => openAt(r.id)}
                >
                  <Logo path={r.logo1_path} size={48} />
                  <span className="rc-main">
                    <span className="rc-title">
                      <b>{r.community_name}</b>
                      {!seen.has(r.id) && <span className="badge">חדש</span>}
                    </span>
                    <span className="small muted">
                      {fullName(r)} · {r.city}
                    </span>
                    <span className="small muted">
                      {fmtN(reachOf(r))} {t("בקהל", "reach")} · {fmtDate(r.created_at)}
                    </span>
                  </span>
                  <span className="chev" aria-hidden="true">
                    {t("‹", "›")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {openRow && (
        <Details
          row={openRow}
          index={openIndex}
          count={shown.length}
          onClose={() => setOpenId(null)}
          onPrev={() => openIndex > 0 && openAt(shown[openIndex - 1]!.id)}
          onNext={() => openIndex < shown.length - 1 && openAt(shown[openIndex + 1]!.id)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function Logo({ path, size }: { path: string | null; size: number }) {
  const url = useSignedUrl(path);
  return (
    <span className="logo" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">♡</span>}
    </span>
  );
}

function LogoBig({
  path,
  label,
  community,
}: {
  path: string | null;
  label: string;
  community: string;
}) {
  const t = useT();
  const ext = path?.split(".").pop() || "png";
  const view = useSignedUrl(path);
  const dl = useSignedUrl(path, `${community || "logo"}-${label}.${ext}`);
  if (!path) return null;
  return (
    <figure className="logobig">
      <span className="frame">
        {view ? <img src={view} alt={`${label} – ${community}`} /> : null}
      </span>
      <figcaption>
        {label}
        {dl && (
          <a className="link" href={dl}>
            {t("הורדה", "Download")}
          </a>
        )}
      </figcaption>
    </figure>
  );
}

function Details({
  row: r,
  index,
  count,
  onClose,
  onPrev,
  onNext,
  onDeleted,
}: {
  row: AppRow;
  index: number;
  count: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delErr, setDelErr] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const partners = partnersOf(r);

  useEffect(() => {
    setCopied(false);
    setConfirmDel(false);
    setDelErr("");
    panel.current?.scrollTo({ top: 0 });
    panel.current?.focus();
  }, [r.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL: the left arrow moves forward in the list; LTR is the reverse
      const fwd = currentLang() === "en" ? "ArrowRight" : "ArrowLeft";
      const back = currentLang() === "en" ? "ArrowLeft" : "ArrowRight";
      if (e.key === fwd) onNext();
      if (e.key === back) onPrev();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onNext, onPrev]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildSummary(rowToApplication(r)));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const del = async () => {
    setDelErr("");
    const { error } = await supabase.from("applications").delete().eq("id", r.id);
    if (error) return setDelErr(t("המחיקה נכשלה. נסו שוב.", "Delete failed. Try again."));
    const files = [r.logo1_path, r.logo2_path].filter((p): p is string => !!p);
    if (files.length) await supabase.storage.from("logos").remove(files);
    onDeleted(r.id);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${t("בקשה של", "Application from")} ${r.community_name}`}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-top">
          <div className="pager">
            <button
              className="icon"
              onClick={onPrev}
              disabled={index <= 0}
              aria-label={t("הבקשה הקודמת", "Previous application")}
            >
              {t("→", "←")}
            </button>
            <span className="small muted">
              {index + 1} {t("מתוך", "of")} {count}
            </span>
            <button
              className="icon"
              onClick={onNext}
              disabled={index >= count - 1}
              aria-label={t("הבקשה הבאה", "Next application")}
            >
              {t("←", "→")}
            </button>
          </div>
          <button className="icon" onClick={onClose} aria-label={t("סגירה", "Close")}>
            ×
          </button>
        </div>

        <header className="d-head">
          <Logo path={r.logo1_path} size={72} />
          <div>
            <h2>{r.community_name}</h2>
            <p className="muted">
              {r.business_name} · {t("נשלח", "Submitted")} {fmtDate(r.created_at)}
            </p>
          </div>
        </header>

        <section className="d-sec">
          <h3>{t("פרטים אישיים", "Personal details")}</h3>
          <dl>
            <Field k={t("שם", "Name")} v={fullName(r)} />
            <Field k={t("טלפון נייד", "Mobile phone")} v={r.phone} ltr />
            <Field k={t("מייל", "Email")} v={r.email} ltr />
            <Field k={t("עיר מגורים", "City")} v={r.city} />
          </dl>
          <Contact phone={r.phone} email={r.email} />
        </section>

        <section className="d-sec">
          <h3>{t("מאפייני הקהילה והעסק", "Community and business")}</h3>
          <dl>
            <Field k={t("שם הקהילה", "Community name")} v={r.community_name} />
            <Field k={t("שם העסק", "Business name")} v={r.business_name} />
            <Field k={t("ח.פ.", "Company ID")} v={r.company_id} ltr />
            <Field k={t("שנת הקמה", "Year founded")} v={r.founded} />
            <Field k={t("טווח גילאים", "Age range")} v={r.age_range} />
            <Field k={t("מטרת הקהילה", "Community purpose")} v={r.purpose} />
            <Field
              k={t("קהל", "Audience")}
              v={strList(r.audience).length ? <Tags items={strList(r.audience)} /> : null}
            />
            <Field
              k={t("סוגי אירועים", "Event types")}
              v={strList(r.event_types).length ? <Tags items={strList(r.event_types)} /> : null}
            />
            <Field k={t("אירועים ומפגשים שהופקו", "Events produced")} v={fmtN(r.events_count)} />
            <Field k={t("סך משתתפים", "Total attendees")} v={fmtN(r.attendance)} />
          </dl>
          <div className="logos">
            <LogoBig
              path={r.logo1_path}
              label={t("לוגו הקהילה", "Community logo")}
              community={r.community_name}
            />
            <LogoBig
              path={r.logo2_path}
              label={t("לוגו נוסף", "Additional logo")}
              community={r.community_name}
            />
          </div>
        </section>

        <section className="d-sec">
          <h3>{t("פלטפורמות הקהילה", "Community platforms")}</h3>
          <dl>
            <Field k={t("פייסבוק – חברים בקבוצה", "Facebook group members")} v={fmtN(r.fb_group)} />
            <Field k={t("פייסבוק – עוקבים בדף", "Facebook page followers")} v={fmtN(r.fb_page)} />
            <Field k={t("אינסטגרם", "Instagram")} v={fmtN(r.instagram)} />
            <Field k={t("וואטסאפ", "WhatsApp")} v={fmtN(r.whatsapp)} />
            <Field k={t("ניוזלטר", "Newsletter")} v={fmtN(r.newsletter)} />
            <Field
              k={t("אחוז פתיחה", "Open rate")}
              v={r.open_rate == null ? null : `${r.open_rate}%`}
            />
            <Field
              k={t("אחוז הקלקה", "Click rate")}
              v={r.click_rate == null ? null : `${r.click_rate}%`}
            />
            <Field
              k={t("חשיפה כללית משוערת", "Estimated total exposure")}
              v={fmtN(r.total_exposure)}
            />
            <Field k={t("סך קהלים", "Total reach")} v={<b>{fmtN(reachOf(r))}</b>} />
          </dl>
        </section>

        <section className="d-sec">
          <h3>{t("מנהלים ושותפים נוספים", "Additional managers and partners")}</h3>
          {partners.length ? (
            <ul className="partners">
              {partners.map((p, i) => (
                <li key={i}>
                  <div>
                    <b>{p.name || t("ללא שם", "No name")}</b>
                    <div className="small muted" dir="ltr">
                      {[p.phone, p.email].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Contact phone={p.phone} email={p.email} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("לא צוינו שותפים.", "No partners listed.")}</p>
          )}
        </section>

        <footer className="d-foot">
          <button className="btn" onClick={copyAll}>
            {copied ? t("הועתק ✓", "Copied ✓") : t("העתקת כל הפרטים", "Copy all details")}
          </button>
          {!confirmDel ? (
            <button className="btn danger-ghost" onClick={() => setConfirmDel(true)}>
              {t("מחיקת הבקשה", "Delete application")}
            </button>
          ) : (
            <div className="confirm" role="alert">
              <span>
                {t(
                  `למחוק את הבקשה של ${r.community_name}? אי אפשר לבטל את זה.`,
                  `Delete the application from ${r.community_name}? This can't be undone.`,
                )}
              </span>
              <button className="btn danger" onClick={del}>
                {t("כן, למחוק", "Yes, delete")}
              </button>
              <button className="btn" onClick={() => setConfirmDel(false)}>
                {t("ביטול", "Cancel")}
              </button>
            </div>
          )}
          {delErr && <p className="msg err">{delErr}</p>}
        </footer>
      </div>
    </div>
  );
}
