import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  createForm,
  deleteForm,
  duplicateForm,
  isMissingSetup,
  isSlugFree,
  listForms,
  listResponseStubs,
  setFormStatus,
  setHomeForm,
  type ResponseStub,
} from "@/forms/api";
import { blankForm, JOIN_2027, sampleFor } from "@/forms/defaults";
import { cleanSlug, formUrl, slugProblem, withoutShare } from "@/forms/links";
import { TEMPLATES, templateOf } from "@/forms/templates";
import type { FormDef, FormRow, TemplateId } from "@/forms/types";
import { useAdminEmail } from "./context";
import { LegacyDashboard } from "./LegacyDashboard";
import { LinkShortener } from "./LinkShortener";
import { TemplateThumb } from "./TemplateThumb";
import { REFRESH_MS, Stat, currentLang, fmtDate, fmtN, sameDay, timeAgo, useT } from "./shared";

export const formLink = (slug: string, home?: boolean) =>
  formUrl(window.location.origin, slug, home);

export const hasUnpublished = (f: FormRow) =>
  !f.published ||
  JSON.stringify(withoutShare(f.published)) !== JSON.stringify(withoutShare(f.draft));

export function AdminTop({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  const email = useAdminEmail();
  return (
    <header className="top">
      <div>
        <p className="eyebrow">
          {eyebrow ?? t("אירוע ההכרויות הגדול של ישראל 2027", "Israel's Biggest Dating Event 2027")}
        </p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        {children}
        <div className="who">
          <span dir="ltr">{email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            {t("התנתקות", "Sign out")}
          </button>
        </div>
      </div>
    </header>
  );
}

export function CopyLink({ url, label }: { url: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn"
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(url)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          })
          .catch(() => window.prompt(t("העתיקו את הקישור:", "Copy the link:"), url));
      }}
    >
      {done ? t("הקישור הועתק ✓", "Link copied ✓") : (label ?? t("העתקת קישור", "Copy link"))}
    </button>
  );
}

const NIL_ID = "00000000-0000-0000-0000-000000000000";

type Counts = { total: number; today: number; last: string | null };

export function FormsHome() {
  const t = useT();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [stubs, setStubs] = useState<ResponseStub[]>([]);
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([listForms(), listResponseStubs()]);
      setForms(f);
      setStubs(s);
      setErr("");
      setUpdatedAt(new Date());
    } catch (e) {
      if (isMissingSetup(e)) setMissing(true);
      else
        setErr(
          t(
            "טעינת הטפסים נכשלה. לחצו ״רענון״ כדי לנסות שוב.",
            "Couldn't load the forms. Click Refresh to try again.",
          ),
        );
    }
  }, [t]);

  useEffect(() => {
    load();
    const poll = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const counts = useMemo(() => {
    const m = new Map<string, Counts>();
    const today = new Date();
    for (const s of stubs) {
      const c = m.get(s.form_id) ?? { total: 0, today: 0, last: null };
      c.total++;
      if (sameDay(new Date(s.created_at), today)) c.today++;
      if (!c.last || s.created_at > c.last) c.last = s.created_at;
      m.set(s.form_id, c);
    }
    return m;
  }, [stubs]);

  if (missing) return <SetupNeeded />;

  const list = forms ?? [];
  const totalToday = list.reduce((n, f) => n + (counts.get(f.id)?.today ?? 0), 0);

  return (
    <div className="dash">
      <AdminTop title={t("הטפסים שלי", "My forms")}>
        <button className="btn" onClick={load}>
          ↻ {t("רענון", "Refresh")}
          {updatedAt && <span className="small">{timeAgo(updatedAt, now)}</span>}
        </button>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + {t("טופס חדש", "New form")}
        </button>
      </AdminTop>

      <section className="stats four" aria-label={t("סיכום", "Summary")}>
        <Stat label={t("טפסים", "Forms")} value={fmtN(list.length)} />
        <Stat
          label={t("טפסים פתוחים", "Open forms")}
          value={fmtN(list.filter((f) => f.status === "open" && f.published).length)}
        />
        <Stat label={t("סך תגובות", "Total responses")} value={fmtN(stubs.length)} />
        <Stat
          label={t("תגובות היום", "Responses today")}
          value={fmtN(totalToday)}
          accent={totalToday > 0}
        />
      </section>

      {err && <p className="msg err">{err}</p>}
      {!forms && !err && <p className="center muted">{t("טוען טפסים…", "Loading forms…")}</p>}

      {forms && forms.length === 0 && (
        <div className="card empty">
          <h2>{t("עוד אין טפסים", "No forms yet")}</h2>
          <p className="muted">
            {t(
              "צרו את הטופס הראשון, מאפס או מתבנית.",
              "Create your first form, from scratch or from a template.",
            )}
          </p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            + {t("טופס חדש", "New form")}
          </button>
        </div>
      )}

      <ul className="form-grid">
        {list.map((f) => (
          <FormCard key={f.id} form={f} counts={counts.get(f.id)} onChanged={load} />
        ))}
      </ul>

      {forms && <LinkShortener />}

      <p className="small muted legacy-link">
        <Link to="/admin/legacy">
          {t("הבקשות מהטופס הישן (גיבוי)", "Requests from the old form (backup)")}
        </Link>
      </p>

      {creating && <NewFormDialog forms={list} onClose={() => setCreating(false)} />}
    </div>
  );
}

function FormCard({
  form: f,
  counts,
  onChanged,
}: {
  form: FormRow;
  counts: Counts | undefined;
  onChanged: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const tpl = templateOf(f.template);
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const live = !!f.published;
  const changes = live && hasUnpublished(f);
  const name = f.title || f.draft.texts.title || t("טופס ללא שם", "Untitled form");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      setMenu(false);
      onChanged();
    } catch (e) {
      console.error(e);
      setErr(t("הפעולה נכשלה. נסו שוב.", "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="form-card card">
      <div
        className="fc-strip"
        style={{
          background: `linear-gradient(90deg, ${tpl.swatch[0]}, ${tpl.swatch[1]}, ${f.accent || tpl.accent})`,
        }}
      />
      <div className="fc-body">
        <div className="fc-pills">
          {!live ? (
            <span className="pill draft">{t("טיוטה, לא פורסם", "Draft, not published")}</span>
          ) : f.status === "open" ? (
            <span className="pill open">{t("פתוח לתגובות", "Accepting responses")}</span>
          ) : (
            <span className="pill closed">{t("סגור", "Closed")}</span>
          )}
          {changes && (
            <span className="pill warn">{t("יש שינויים שלא פורסמו", "Unpublished changes")}</span>
          )}
          {f.is_home && <span className="pill home">{t("עמוד הבית", "Home page")}</span>}
        </div>
        <h2>
          <Link to="/admin/forms/$formId" params={{ formId: f.id }}>
            {name}
          </Link>
        </h2>
        <p className="small muted">
          {t("עיצוב", "Design")}: {currentLang() === "en" ? tpl.en : tpl.he}
        </p>
        <dl className="fc-nums">
          <div>
            <dt>{t("תגובות", "Responses")}</dt>
            <dd>{fmtN(counts?.total ?? 0)}</dd>
          </div>
          <div>
            <dt>{t("היום", "Today")}</dt>
            <dd className={counts?.today ? "hot" : undefined}>{fmtN(counts?.today ?? 0)}</dd>
          </div>
          <div>
            <dt>{t("אחרונה", "Latest")}</dt>
            <dd className="small">{counts?.last ? fmtDate(counts.last) : "—"}</dd>
          </div>
        </dl>
        <div className="fc-actions">
          <Link className="btn primary" to="/admin/forms/$formId" params={{ formId: f.id }}>
            {t("תגובות וסטטיסטיקות", "Responses & stats")}
          </Link>
          <Link className="btn" to="/admin/forms/$formId/edit" params={{ formId: f.id }}>
            {t("עריכה", "Edit")}
          </Link>
          <button
            className="btn icon-only"
            aria-expanded={menu}
            aria-label={t("עוד פעולות", "More actions")}
            onClick={() => setMenu((m) => !m)}
          >
            ⋯
          </button>
        </div>
        {menu && (
          <div className="fc-menu" role="menu">
            {live && <CopyLink url={formLink(f.slug, f.is_home)} />}
            {live && f.draft.share && (
              <CopyLink
                url={f.draft.share.shortUrl}
                label={t("העתקת הקישור הקצר", "Copy tiny link")}
              />
            )}
            {live && (
              <a
                className="btn"
                href={f.is_home ? "/" : `/${f.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("פתיחת הטופס", "Open form")}
              </a>
            )}
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const copy = await duplicateForm(f, `${t("עותק של", "Copy of")} ${name}`);
                  navigate({ to: "/admin/forms/$formId/edit", params: { formId: copy.id } });
                })
              }
            >
              {t("שכפול הטופס", "Duplicate")}
            </button>
            {live && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(() => setFormStatus(f.id, f.status === "open" ? "closed" : "open"))
                }
              >
                {f.status === "open"
                  ? t("סגירה לתגובות", "Stop accepting responses")
                  : t("פתיחה לתגובות", "Accept responses")}
              </button>
            )}
            {live && !f.is_home && (
              <button className="btn" disabled={busy} onClick={() => run(() => setHomeForm(f.id))}>
                {t("הצגה בעמוד הבית", "Show on home page")}
              </button>
            )}
            {!confirmDel ? (
              <button className="btn danger-ghost" onClick={() => setConfirmDel(true)}>
                {t("מחיקת הטופס", "Delete form")}
              </button>
            ) : (
              <div className="confirm" role="alert">
                <span>
                  {t(
                    `למחוק את "${name}" ואת כל ${counts?.total ?? 0} התגובות שלו? אי אפשר לבטל.`,
                    `Delete "${name}" and all ${counts?.total ?? 0} responses? This can't be undone.`,
                  )}
                </span>
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => run(() => deleteForm(f))}
                >
                  {t("כן, למחוק", "Yes, delete")}
                </button>
                <button className="btn" onClick={() => setConfirmDel(false)}>
                  {t("ביטול", "Cancel")}
                </button>
              </div>
            )}
            {err && <p className="msg err">{err}</p>}
          </div>
        )}
      </div>
    </li>
  );
}

function NewFormDialog({ forms, onClose }: { forms: FormRow[]; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [start, setStart] = useState<string>("blank");
  const [template, setTemplate] = useState<TemplateId>("letter");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const src = forms.find((f) => f.id === start);
      const draft =
        start === "blank"
          ? blankForm(template)
          : start === "join"
            ? structuredClone(JOIN_2027)
            : structuredClone(src!.draft);
      if (name.trim() && start === "blank") draft.texts.title = name.trim();
      delete draft.share;
      let slug: string | undefined;
      if (link.trim()) {
        slug = cleanSlug(link);
        const problem = slugProblem(slug);
        if (problem) {
          setErr(
            problem === "reserved"
              ? t(
                  "השם הזה שמור לאתר עצמו. בחרו שם אחר לקישור.",
                  "That name is used by the site itself. Pick another link name.",
                )
              : t(
                  "שם הקישור: אותיות באנגלית, מספרים ומקפים (2–60 תווים).",
                  "Link name: English letters, numbers and dashes (2–60).",
                ),
          );
          setBusy(false);
          return;
        }
        if (!(await isSlugFree(slug, NIL_ID))) {
          setErr(t("הקישור הזה כבר תפוס. נסו שם אחר.", "That link is taken. Try another name."));
          setBusy(false);
          return;
        }
      }
      const row = await createForm({
        ...(slug ? { slug } : {}),
        title:
          name.trim() ||
          (src ? `${t("עותק של", "Copy of")} ${src.title}` : t("טופס חדש", "New form")),
        template: src && start !== "blank" ? src.template : template,
        accent: src ? src.accent : null,
        draft,
      });
      navigate({ to: "/admin/forms/$formId/edit", params: { formId: row.id } });
    } catch (e) {
      console.error(e);
      setErr(t("יצירת הטופס נכשלה. נסו שוב.", "Couldn't create the form. Try again."));
      setBusy(false);
    }
  };

  const fromExisting = start !== "blank";

  return (
    <div className="overlay center-dialog" onClick={onClose}>
      <div
        className="dialog card"
        role="dialog"
        aria-modal="true"
        aria-label={t("טופס חדש", "New form")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>{t("טופס חדש", "New form")}</h2>
          <button className="icon" onClick={onClose} aria-label={t("סגירה", "Close")}>
            ×
          </button>
        </div>

        <label className="lbl" htmlFor="nf-name">
          {t("שם הטופס (רק אתם רואים אותו)", "Form name (only you see it)")}
        </label>
        <input
          id="nf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("למשל: הרשמת מתנדבים 2027", "e.g. Volunteer sign-up 2027")}
          autoFocus
        />

        <label className="lbl" htmlFor="nf-link">
          {t("שם לקישור (לא חובה, אפשר לשנות אחר כך)", "Link name (optional, can change later)")}
        </label>
        <div className="slug-row">
          <span className="slug-base" dir="ltr">
            {window.location.host}/
          </span>
          <input
            id="nf-link"
            dir="ltr"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => setLink((l) => cleanSlug(l))}
            placeholder="hafakot-2027"
          />
        </div>

        <span className="lbl">{t("להתחיל מ…", "Start from…")}</span>
        <div className="choices">
          <label className={`choice${start === "blank" ? " on" : ""}`}>
            <input
              type="radio"
              name="nf-start"
              checked={start === "blank"}
              onChange={() => setStart("blank")}
            />
            <b>{t("טופס ריק", "Blank form")}</b>
            <span className="small muted">
              {t("שלוש שאלות בסיס, ומשם בונים", "Three basic questions to build on")}
            </span>
          </label>
          <label className={`choice${start === "join" ? " on" : ""}`}>
            <input
              type="radio"
              name="nf-start"
              checked={start === "join"}
              onChange={() => setStart("join")}
            />
            <b>{t("תבנית הצטרפות קהילות", "Community sign-up template")}</b>
            <span className="small muted">
              {t("כל השאלות של הטופס המקורי", "All questions of the original form")}
            </span>
          </label>
          {forms.length > 0 && (
            <label className={`choice${fromExisting && start !== "join" ? " on" : ""}`}>
              <input
                type="radio"
                name="nf-start"
                checked={fromExisting && start !== "join"}
                onChange={() => setStart(forms[0]!.id)}
              />
              <b>{t("עותק של טופס קיים", "Copy of an existing form")}</b>
              <select
                aria-label={t("בחירת טופס להעתקה", "Form to copy")}
                value={fromExisting && start !== "join" ? start : forms[0]!.id}
                onChange={(e) => setStart(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title || f.draft.texts.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!(fromExisting && start !== "join") && (
          <>
            <span className="lbl">{t("עיצוב", "Design")}</span>
            <TemplatePicker
              value={template}
              onChange={setTemplate}
              preview={(tp) =>
                start === "blank"
                  ? (() => {
                      const d = blankForm(tp);
                      if (name.trim()) d.texts.title = name.trim();
                      return d;
                    })()
                  : sampleFor(tp)
              }
            />
          </>
        )}

        {err && <p className="msg err">{err}</p>}
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>
            {t("ביטול", "Cancel")}
          </button>
          <button className="btn primary" disabled={busy} onClick={create}>
            {busy ? t("יוצר…", "Creating…") : t("יצירה ומעבר לעריכה", "Create and edit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TemplatePicker({
  value,
  onChange,
  preview,
  accent,
}: {
  value: TemplateId;
  onChange: (t: TemplateId) => void;
  /** what to show inside each design preview (defaults to the sign-up form) */
  preview?: (t: TemplateId) => FormDef;
  accent?: string | null;
}) {
  const en = currentLang() === "en";
  return (
    <div className="tpl-grid" role="radiogroup">
      {TEMPLATES.map((tp) => (
        // a div, not a <button>: the live preview inside contains buttons of its own
        <div
          key={tp.id}
          role="radio"
          tabIndex={0}
          aria-checked={value === tp.id}
          aria-label={en ? tp.en : tp.he}
          className={`tpl-card${value === tp.id ? " on" : ""}`}
          onClick={() => onChange(tp.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(tp.id);
            }
          }}
        >
          <TemplateThumb
            template={tp.id}
            def={preview ? preview(tp.id) : sampleFor(tp.id)}
            accent={accent ?? null}
          />
          <span className="tpl-name">
            <span className="tpl-radio" aria-hidden="true" />
            <b>{en ? tp.en : tp.he}</b>
          </span>
          <span className="small muted">{en ? tp.descEn : tp.descHe}</span>
        </div>
      ))}
    </div>
  );
}

function SetupNeeded() {
  const t = useT();
  const email = useAdminEmail();
  return (
    <div className="dash">
      <AdminTop title={t("בקשות הצטרפות", "Applications")} />
      <div className="card setup-note">
        <b>
          {t(
            "מערכת הטפסים מוכנה, וצריך רק להפעיל אותה.",
            "The forms system is ready and just needs switching on.",
          )}
        </b>
        <p className="small muted">
          {t(
            "עד שמריצים את קובץ ההגדרה docs/forms-setup-1-schema.sql ו-docs/forms-setup-2-data.sql, האתר ממשיך לעבוד בדיוק כמו היום, והבקשות מופיעות כאן למטה.",
            "Until docs/forms-setup-1-schema.sql and docs/forms-setup-2-data.sql are run, the site keeps working exactly as today and requests appear below.",
          )}
        </p>
      </div>
      <LegacyDashboard email={email} embedded />
    </div>
  );
}
