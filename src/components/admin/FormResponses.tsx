import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  answerText,
  answersSummary,
  fieldsForResponse,
  hasSum,
  isPeople,
  isStrList,
  sumTotal,
} from "@/forms/answers";
import {
  deleteResponse,
  getForm,
  listResponses,
  signedUrls,
  submitResponse,
  updateResponseAnswers,
  updateResponseMeta,
} from "@/forms/api";
import { FormRenderer, type SubmitResult } from "@/forms/FormRenderer";
import type {
  Answers,
  Field,
  FormDef,
  FormRow,
  PersonAnswer,
  ResponseRow,
  ResponseStatus,
} from "@/forms/types";
import { RESPONSE_STATUSES, allFields, hasOptions } from "@/forms/types";
import { buildXlsx, downloadBlob, type XlsxCell, type XlsxColumn } from "@/lib/xlsx";
import { AdminTop, CopyLink, formLink, hasUnpublished } from "./FormsHome";
import {
  Contact,
  Field as Kv,
  NeedsUpdate,
  REFRESH_MS,
  Stat,
  Tags,
  currentLang,
  fmtDate,
  fmtN,
  readSeen,
  sameDay,
  timeAgo,
  useT,
  useUpdate3,
  writeSeen,
} from "./shared";

/* ---------------- helpers ---------------- */

/** The definition used to read responses: the published one, or the draft if never published. */
const readDef = (f: FormRow): FormDef => f.published ?? f.draft;

function listColumns(def: FormDef): Field[] {
  const all = allFields(def);
  const chosen = def.listFields
    .map((id) => all.find((f) => f.id === id))
    .filter((f): f is Field => !!f);
  if (chosen.length) return chosen.slice(0, 4);
  return all
    .filter((f) => ["short", "phone", "email", "dropdown", "single"].includes(f.type))
    .slice(0, 4);
}

function firstFile(def: FormDef, r: ResponseRow) {
  for (const f of allFields(def))
    if (f.type === "file" && r.files[f.id]?.length) return r.files[f.id]![0]!;
  return Object.values(r.files).flat()[0] ?? null;
}

function useSigned(path: string | null, download?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!path) return;
    supabase.storage
      .from("logos")
      .createSignedUrl(path, 3600, download ? { download } : undefined)
      .then(({ data }) => live && setUrl(data?.signedUrl ?? null));
    return () => {
      live = false;
    };
  }, [path, download]);
  return url;
}

/* ----- handling status ----- */

const statusOf = (r: ResponseRow): ResponseStatus => r.status ?? "new";
const statusName = (s: ResponseStatus) => {
  const x = RESPONSE_STATUSES.find((y) => y.id === s)!;
  return currentLang() === "en" ? x.en : x.he;
};

function StatusSelect({
  value,
  onChange,
  compact,
}: {
  value: ResponseStatus;
  onChange: (s: ResponseStatus) => void;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <select
      className={`status-sel st-${value}${compact ? " compact" : ""}`}
      aria-label={t("סטטוס טיפול", "Handling status")}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as ResponseStatus)}
    >
      {RESPONSE_STATUSES.map((x) => (
        <option key={x.id} value={x.id}>
          {statusName(x.id)}
        </option>
      ))}
    </select>
  );
}

/* ----- possible duplicates: same phone or email as another response of this form ----- */

const phoneKey = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
};

/** response id -> ids of the other responses that share a phone number or an email */
function findDuplicates(def: FormDef, rows: ResponseRow[]) {
  const phoneIds = allFields(def)
    .filter((f) => f.type === "phone")
    .map((f) => f.id);
  const emailIds = allFields(def)
    .filter((f) => f.type === "email")
    .map((f) => f.id);
  const byKey = new Map<string, string[]>();
  for (const r of rows) {
    const keys = new Set<string>();
    for (const id of phoneIds) {
      const v = r.answers[id];
      if (typeof v === "string" && phoneKey(v)) keys.add(`p:${phoneKey(v)}`);
    }
    for (const id of emailIds) {
      const v = r.answers[id];
      if (typeof v === "string" && v.trim()) keys.add(`e:${v.trim().toLowerCase()}`);
    }
    for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), r.id]);
  }
  const out = new Map<string, Set<string>>();
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const set = out.get(id) ?? new Set<string>();
      ids.forEach((o) => o !== id && set.add(o));
      out.set(id, set);
    }
  }
  return out;
}

const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(p);

function Thumb({ path, size }: { path: string | null; size: number }) {
  const url = useSigned(path && isImage(path) ? path : null);
  return (
    <span className="logo" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span aria-hidden="true">
          {path ? (path.split(".").pop() || "").toUpperCase().slice(0, 4) : "♡"}
        </span>
      )}
    </span>
  );
}

function FileTile({ path, label }: { path: string; label: string }) {
  const t = useT();
  const name = path.split("/").pop() || "file";
  const view = useSigned(path);
  const dl = useSigned(path, `${label}-${name}`);
  return (
    <figure className="logobig">
      <span className="frame">
        {view && isImage(path) ? (
          <img src={view} alt={label} />
        ) : (
          <span className="muted small">{name}</span>
        )}
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

/* ---------------- page ---------------- */

export function FormResponses({ formId }: { formId: string }) {
  const t = useT();
  const [form, setForm] = useState<FormRow | null | undefined>(undefined);
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"list" | "summary">("list");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const seenKey = `s27-seen-${formId}`;
  const [seen, setSeen] = useState<Set<string>>(() => readSeen(seenKey));

  const load = useCallback(async () => {
    try {
      const [f, r] = await Promise.all([getForm(formId), listResponses(formId)]);
      setForm(f);
      setRows(r);
      setErr("");
      setUpdatedAt(new Date());
    } catch (e) {
      console.error(e);
      setErr(t("טעינת התגובות נכשלה. לחצו ״רענון״.", "Couldn't load responses. Click Refresh."));
    }
  }, [formId, t]);

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

  const markSeen = useCallback(
    (ids: string[]) =>
      setSeen((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        writeSeen(next, seenKey);
        return next;
      }),
    [seenKey],
  );

  if (form === null)
    return (
      <div className="dash">
        <AdminTop title={t("הטופס לא נמצא", "Form not found")} />
        <Link to="/admin">{t("← חזרה לטפסים", "← Back to forms")}</Link>
      </div>
    );
  if (!form)
    return (
      <div className="dash">
        <p className="center muted">{err || t("טוען…", "Loading…")}</p>
      </div>
    );

  const def = readDef(form);
  const name = form.title || def.texts.title;

  return (
    <div className="dash">
      <nav className="crumbs small">
        <Link to="/admin">{t("הטפסים שלי", "My forms")}</Link> <span aria-hidden="true">/</span>{" "}
        {name}
      </nav>
      <AdminTop title={name}>
        <button className="btn" onClick={load}>
          ↻ {t("רענון", "Refresh")}
          {updatedAt && <span className="small">{timeAgo(updatedAt, now)}</span>}
        </button>
        {form.published && <CopyLink url={formLink(form.slug, form.is_home)} />}
        {form.published && form.draft.share && (
          <CopyLink
            url={form.draft.share.shortUrl}
            label={t("העתקת הקישור הקצר", "Copy tiny link")}
          />
        )}
        <Link className="btn" to="/admin/forms/$formId/edit" params={{ formId }}>
          {t("עריכת הטופס", "Edit form")}
        </Link>
      </AdminTop>

      {!form.published && (
        <p className="newbar">
          {t(
            "הטופס עוד לא פורסם, ולכן אי אפשר לענות עליו. פרסמו אותו מתוך מסך העריכה.",
            "This form isn't published yet, so nobody can answer it. Publish it from the editor.",
          )}
        </p>
      )}
      {form.published && hasUnpublished(form) && (
        <p className="newbar soft">
          {t(
            "יש בטופס שינויים שעוד לא פורסמו. התגובות כאן מוצגות לפי הגרסה שפורסמה.",
            "There are unpublished changes. Responses are shown by the published version.",
          )}
        </p>
      )}

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "list"}
          className={tab === "list" ? "on" : ""}
          onClick={() => setTab("list")}
        >
          {t("תגובות", "Responses")} <span className="count">{fmtN(rows?.length ?? 0)}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "summary"}
          className={tab === "summary" ? "on" : ""}
          onClick={() => setTab("summary")}
        >
          {t("סיכום וסטטיסטיקות", "Summary & stats")}
        </button>
      </div>

      {err && <p className="msg err">{err}</p>}
      {!rows && !err && <p className="center muted">{t("טוען תגובות…", "Loading responses…")}</p>}
      {rows && tab === "list" && (
        <ResponsesList
          form={form}
          def={def}
          rows={rows}
          seen={seen}
          markSeen={markSeen}
          onChanged={load}
          setRows={setRows}
        />
      )}
      {rows && tab === "summary" && <Summary def={def} rows={rows} />}
    </div>
  );
}

/* ---------------- list ---------------- */

type Sort = "new" | "old" | "sum" | "title";
/** "" = all, a status id, or "__dup" for possible duplicates */
type StatusFilter = "" | ResponseStatus | "__dup";

function ResponsesList({
  form,
  def,
  rows,
  seen,
  markSeen,
  onChanged,
  setRows,
}: {
  form: FormRow;
  def: FormDef;
  rows: ResponseRow[];
  seen: Set<string>;
  markSeen: (ids: string[]) => void;
  onChanged: () => void;
  setRows: (fn: (r: ResponseRow[] | null) => ResponseRow[] | null) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [adding, setAdding] = useState(false);
  const [metaErr, setMetaErr] = useState("");
  const v3 = useUpdate3();
  const dups = useMemo(() => findDuplicates(def, rows), [def, rows]);

  /** Change status / note right away on screen, then save. */
  const saveMeta = async (r: ResponseRow, patch: { status?: ResponseStatus; notes?: string }) => {
    setRows((rs) => (rs ?? []).map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    try {
      await updateResponseMeta(r.id, patch);
      setMetaErr("");
      return true;
    } catch (e) {
      console.error(e);
      setMetaErr(t("השמירה נכשלה. נסו שוב.", "Saving failed. Try again."));
      return false;
    }
  };
  const cols = listColumns(def);
  const withSum = hasSum(def);
  const choiceFields = allFields(def).filter((f) => hasOptions(f.type) || f.type === "yesno");
  const filterF = choiceFields.find((f) => f.id === filterField);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = allFields(def);
    const list = rows.filter((r) => {
      if (statusFilter === "__dup" && !dups.has(r.id)) return false;
      if (statusFilter && statusFilter !== "__dup" && statusOf(r) !== statusFilter) return false;
      if (filterF && filterValue) {
        const v = r.answers[filterF.id];
        const ok = isStrList(v ?? null) ? (v as string[]).includes(filterValue) : v === filterValue;
        if (!ok) return false;
      }
      if (!needle) return true;
      return all
        .map((f) => answerText(f, r.answers[f.id]))
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const title = (r: ResponseRow) => (cols[0] ? answerText(cols[0], r.answers[cols[0].id]) : "");
    const by: Record<Sort, (a: ResponseRow, b: ResponseRow) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      old: (a, b) => a.created_at.localeCompare(b.created_at),
      sum: (a, b) => sumTotal(def, b.answers) - sumTotal(def, a.answers),
      title: (a, b) => title(a).localeCompare(title(b), "he"),
    };
    return [...list].sort(by[sort]);
  }, [rows, q, sort, def, cols, filterF, filterValue, statusFilter, dups]);
  const statusCount = (s: ResponseStatus) => rows.filter((r) => statusOf(r) === s).length;

  const unseen = rows.filter((r) => !seen.has(r.id)).length;
  const today = rows.filter((r) => sameDay(new Date(r.created_at), new Date())).length;
  const openIndex = shown.findIndex((r) => r.id === openId);
  // (a response stays open even if a status change moves it out of the current filter)
  const openRow = openIndex >= 0 ? shown[openIndex]! : (rows.find((r) => r.id === openId) ?? null);
  const openAt = (id: string) => {
    setOpenId(id);
    markSeen([id]);
  };

  const exportXlsx = async () => {
    if (!shown.length) return;
    setExporting(true);
    try {
      const paths = shown.flatMap((r) => Object.values(r.files).flat());
      const links = await signedUrls(paths, 60 * 60 * 24 * 7);
      const { columns, data } = exportTable(def, shown, links, !!v3, dups);
      const stamp = new Date().toISOString().slice(0, 10);
      const safe = (form.title || def.texts.title || "form")
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 40);
      downloadBlob(buildXlsx(t("תגובות", "Responses"), columns, data), `${safe}-${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <section className={`stats ${withSum ? "four" : "three"}`}>
        <Stat label={t("סך תגובות", "Total responses")} value={fmtN(rows.length)} />
        <Stat
          label={t("חדשות שלא נפתחו", "New, not opened")}
          value={fmtN(unseen)}
          accent={unseen > 0}
        />
        <Stat label={t("הגיעו היום", "Today")} value={fmtN(today)} />
        {withSum && (
          <Stat
            label={t("סכום כולל", "Grand total")}
            value={fmtN(rows.reduce((n, r) => n + sumTotal(def, r.answers), 0))}
          />
        )}
      </section>

      <section className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={t("חיפוש בכל התשובות", "Search all answers")}
          aria-label={t("חיפוש", "Search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {choiceFields.length > 0 && (
          <select
            aria-label={t("סינון לפי שאלה", "Filter by question")}
            value={filterField}
            onChange={(e) => {
              setFilterField(e.target.value);
              setFilterValue("");
            }}
          >
            <option value="">{t("סינון לפי שאלה…", "Filter by question…")}</option>
            {choiceFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        )}
        {filterF && (
          <select
            aria-label={t("ערך לסינון", "Filter value")}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
          >
            <option value="">{t("כל התשובות", "Any answer")}</option>
            {(filterF.type === "yesno" ? ["כן", "לא"] : (filterF.options ?? [])).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label={t("סינון לפי סטטוס", "Filter by status")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="">{t("כל הסטטוסים", "All statuses")}</option>
          {v3 !== false &&
            RESPONSE_STATUSES.map((x) => (
              <option key={x.id} value={x.id}>
                {statusName(x.id)} ({statusCount(x.id)})
              </option>
            ))}
          <option value="__dup">
            {t(`כפולים אפשריים (${dups.size})`, `Possible duplicates (${dups.size})`)}
          </option>
        </select>
        <select
          aria-label={t("מיון", "Sort")}
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="new">{t("החדשות ראשונות", "Newest first")}</option>
          <option value="old">{t("הישנות ראשונות", "Oldest first")}</option>
          {cols[0] && (
            <option value="title">{t(`לפי ${cols[0].label}`, `By ${cols[0].label}`)}</option>
          )}
          {withSum && <option value="sum">{t("הסכום הגבוה ראשון", "Highest total first")}</option>}
        </select>
        <div className="spacer" />
        <button
          className="btn"
          onClick={() => setAdding(true)}
          title={t(
            "להוסיף הרשמה שהגיעה בטלפון, בוואטסאפ או במייל",
            "Add a sign-up that came by phone, WhatsApp or email",
          )}
        >
          + {t("הוספה ידנית", "Add manually")}
        </button>
        <button className="btn primary" onClick={exportXlsx} disabled={!shown.length || exporting}>
          {exporting
            ? t("מכין קובץ…", "Preparing…")
            : t(`ייצוא לאקסל (${shown.length})`, `Export to Excel (${shown.length})`)}
        </button>
      </section>

      <p className="small muted list-explain">
        {t(
          'לכל תגובה אפשר לבחור סטטוס טיפול (חדש, בטיפול, אושר, לא רלוונטי) ולכתוב הערה פנימית שרק אתם רואים. "כפול?" מסמן תגובות עם אותו טלפון או מייל כמו תגובה אחרת.',
          'Each response can get a handling status (new, in progress, approved, not relevant) and a private note only you see. "Duplicate?" marks responses with the same phone or email as another one.',
        )}
      </p>
      {v3 === false && <NeedsUpdate what={t("סטטוס והערות", "Status & notes")} />}
      {metaErr && <p className="msg err">{metaErr}</p>}

      {unseen > 0 && (
        <p className="newbar">
          {unseen === 1
            ? t("יש תגובה חדשה אחת שעוד לא נפתחה.", "1 new response not opened yet.")
            : t(
                `יש ${unseen} תגובות חדשות שעוד לא נפתחו.`,
                `${unseen} new responses not opened yet.`,
              )}
          <button className="link" onClick={() => markSeen(rows.map((r) => r.id))}>
            {t("סימון הכל כנקרא", "Mark all as read")}
          </button>
        </p>
      )}

      {rows.length === 0 && (
        <div className="card empty">
          <h2>{t("עוד אין תגובות", "No responses yet")}</h2>
          <p className="muted">
            {t(
              "ברגע שמישהו ימלא את הטופס, התגובה תופיע כאן. הדף מתרענן לבד כל 30 שניות.",
              "As soon as someone fills the form, it shows up here. This page refreshes every 30 seconds.",
            )}
          </p>
        </div>
      )}
      {rows.length > 0 && shown.length === 0 && (
        <p className="center muted">{t("אין תגובות שמתאימות לחיפוש.", "No responses match.")}</p>
      )}

      {shown.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th aria-label={t("קובץ", "File")} />
                  {cols.map((c) => (
                    <th key={c.id}>{c.label}</th>
                  ))}
                  {withSum && <th>{t("סכום", "Total")}</th>}
                  {v3 && <th>{t("סטטוס", "Status")}</th>}
                  <th>{t("נשלח", "Sent")}</th>
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
                      <Thumb path={firstFile(def, r)} size={40} />
                    </td>
                    {cols.map((c, i) => (
                      <td
                        key={c.id}
                        dir={c.type === "phone" || c.type === "email" ? "ltr" : undefined}
                        className={c.type === "phone" ? "num" : undefined}
                      >
                        {i === 0 ? (
                          <b>{answerText(c, r.answers[c.id]) || "—"}</b>
                        ) : (
                          answerText(c, r.answers[c.id]) || "—"
                        )}
                        {i === 0 && !seen.has(r.id) && (
                          <span className="badge">{t("לא נפתח", "Unopened")}</span>
                        )}
                        {i === 0 && dups.has(r.id) && <DupBadge />}
                      </td>
                    ))}
                    {withSum && <td className="num">{fmtN(sumTotal(def, r.answers))}</td>}
                    {v3 && (
                      <td>
                        <StatusSelect
                          compact
                          value={statusOf(r)}
                          onChange={(st) => saveMeta(r, { status: st })}
                        />
                      </td>
                    )}
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
                  <Thumb path={firstFile(def, r)} size={48} />
                  <span className="rc-main">
                    <span className="rc-title">
                      <b>
                        {cols[0]
                          ? answerText(cols[0], r.answers[cols[0].id]) || "—"
                          : t("תגובה", "Response")}
                      </b>
                      {!seen.has(r.id) && <span className="badge">{t("לא נפתח", "Unopened")}</span>}
                      {dups.has(r.id) && <DupBadge />}
                    </span>
                    {v3 && (
                      <span className={`st-pill st-${statusOf(r)}`}>{statusName(statusOf(r))}</span>
                    )}
                    <span className="small muted">
                      {cols
                        .slice(1)
                        .map((c) => answerText(c, r.answers[c.id]))
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="small muted">{fmtDate(r.created_at)}</span>
                  </span>
                  <span className="chev" aria-hidden="true">
                    ‹
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {openRow && (
        <ResponseDetails
          form={form}
          def={def}
          row={openRow}
          v3={v3}
          dupOf={[...(dups.get(openRow.id) ?? [])]
            .map((id) => rows.find((x) => x.id === id))
            .filter((x): x is ResponseRow => !!x)}
          onOpen={openAt}
          onMeta={(patch) => saveMeta(openRow, patch)}
          onUpdated={(nr) => setRows((rs) => (rs ?? []).map((x) => (x.id === nr.id ? nr : x)))}
          index={openIndex}
          count={shown.length}
          onClose={() => setOpenId(null)}
          onPrev={() => openIndex > 0 && openAt(shown[openIndex - 1]!.id)}
          onNext={() => openIndex < shown.length - 1 && openAt(shown[openIndex + 1]!.id)}
          onDeleted={(id) => {
            setOpenId(null);
            setRows((rs) => (rs ?? []).filter((r) => r.id !== id));
            onChanged();
          }}
        />
      )}

      {adding && (
        <AddResponse
          form={form}
          def={def}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function DupBadge() {
  const t = useT();
  return (
    <span
      className="badge dup"
      title={t(
        "אותו טלפון או מייל כמו תגובה אחרת בטופס הזה",
        "Same phone or email as another response to this form",
      )}
    >
      {t("כפול?", "Duplicate?")}
    </span>
  );
}

/* ---------------- add / edit a response by hand ---------------- */

const fileNames = (files: Record<string, File[]>) =>
  Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.map((f) => f.name)]));

function AddResponse({
  form,
  def,
  onClose,
  onAdded,
}: {
  form: FormRow;
  def: FormDef;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const submit = async (a: Answers, files: Record<string, File[]>): Promise<SubmitResult> => {
    try {
      await submitResponse({ id: form.id, def }, a, files);
      onAdded();
      return { ok: true };
    } catch (e) {
      console.error(e, fileNames(files));
      return { ok: false, error: t("השמירה נכשלה. נסו שוב.", "Saving failed. Try again.") };
    }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("הוספת תגובה ידנית", "Add a response manually")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-top">
          <b>{t("הוספת תגובה ידנית", "Add a response manually")}</b>
          <button className="icon" onClick={onClose} aria-label={t("סגירה", "Close")}>
            ×
          </button>
        </div>
        <p className="small muted">
          {t(
            "למילוי במקום מישהו שנרשם בטלפון, בוואטסאפ או במייל. אין שדות חובה כאן, ממלאים מה שיש. התגובה תופיע ברשימה ובאקסל כמו כל תגובה אחרת. עובד גם כשהטופס סגור.",
            "For someone who signed up by phone, WhatsApp or email. Nothing is required here; fill in what you have. It shows in the list and in Excel like any other response. Works even when the form is closed.",
          )}
        </p>
        <FormRenderer
          def={def}
          template={form.template}
          accent={form.accent}
          mode="admin"
          submitLabel={t("שמירת התגובה", "Save response")}
          onCancel={onClose}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}

/* ---------------- details ---------------- */

function AnswerView({ f, r }: { f: Field; r: ResponseRow }) {
  const t = useT();
  const v = r.answers[f.id];
  if (f.type === "file") {
    const paths = r.files[f.id] ?? [];
    return paths.length ? (
      <div className="logos">
        {paths.map((p) => (
          <FileTile key={p} path={p} label={f.label} />
        ))}
      </div>
    ) : (
      <span className="muted">—</span>
    );
  }
  if (f.type === "people") {
    const people = isPeople(v ?? null) ? (v as PersonAnswer[]) : [];
    return people.length ? (
      <ul className="partners">
        {people.map((p, i) => (
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
      <span className="muted">—</span>
    );
  }
  if (f.type === "multi" && isStrList(v ?? null) && (v as string[]).length)
    return <Tags items={v as string[]} />;
  const text = answerText(f, v);
  if (!text) return <span className="muted">—</span>;
  if (f.type === "phone")
    return (
      <span className="with-actions">
        <span dir="ltr">{text}</span>
        <Contact phone={text} email="" />
      </span>
    );
  if (f.type === "email")
    return (
      <span className="with-actions">
        <span dir="ltr">{text}</span>
        <Contact phone="" email={text} />
      </span>
    );
  return <>{text}</>;
}

function ResponseDetails({
  form,
  def,
  row: r,
  v3,
  dupOf,
  onOpen,
  onMeta,
  onUpdated,
  index,
  count,
  onClose,
  onPrev,
  onNext,
  onDeleted,
}: {
  form: FormRow;
  def: FormDef;
  row: ResponseRow;
  v3: boolean | null;
  dupOf: ResponseRow[];
  onOpen: (id: string) => void;
  onMeta: (patch: { status?: ResponseStatus; notes?: string }) => Promise<boolean>;
  onUpdated: (r: ResponseRow) => void;
  index: number;
  count: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onDeleted: (id: string) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(r.notes ?? "");
  const [noteState, setNoteState] = useState<"" | "saving" | "saved">("");
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delErr, setDelErr] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const { removed } = fieldsForResponse(def, r);
  const cols = listColumns(def);
  const title = cols[0] ? answerText(cols[0], r.answers[cols[0].id]) : t("תגובה", "Response");

  useEffect(() => {
    setEditing(false);
    setNote(r.notes ?? "");
    setNoteState("");
    setCopied(false);
    setConfirmDel(false);
    setDelErr("");
    panel.current?.scrollTo({ top: 0 });
    panel.current?.focus();
  }, [r.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const en = currentLang() === "en";
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
      if (e.key === "Escape") onClose();
      if (typing) return;
      if (e.key === (en ? "ArrowRight" : "ArrowLeft")) onNext();
      if (e.key === (en ? "ArrowLeft" : "ArrowRight")) onPrev();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onNext, onPrev]);

  const saveNote = async () => {
    if (note === (r.notes ?? "")) return;
    setNoteState("saving");
    setNoteState((await onMeta({ notes: note })) ? "saved" : "");
  };

  const saveEdit = async (a: Answers, files: Record<string, File[]>): Promise<SubmitResult> => {
    try {
      // keep answers to questions that were removed from the form since
      const nr = await updateResponseAnswers(r, def, { ...r.answers, ...a }, files);
      onUpdated(nr);
      setEditing(false);
      return { ok: true };
    } catch (e) {
      console.error(e);
      return { ok: false, error: t("השמירה נכשלה. נסו שוב.", "Saving failed. Try again.") };
    }
  };

  const copyAll = async () => {
    try {
      const names = Object.fromEntries(
        Object.entries(r.files).map(([k, v]) => [k, v.map((p) => p.split("/").pop() || p)]),
      );
      await navigator.clipboard.writeText(answersSummary(def, r.answers, names));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const del = async () => {
    setDelErr("");
    try {
      await deleteResponse(r);
      onDeleted(r.id);
    } catch {
      setDelErr(t("המחיקה נכשלה. נסו שוב.", "Delete failed. Try again."));
    }
  };

  const section = (titleText: string, fields: Field[], key: string): ReactNode => (
    <section className="d-sec" key={key}>
      <h3>{titleText}</h3>
      <dl>
        {fields.map((f) => (
          <Kv key={f.id} k={f.label || titleText} v={<AnswerView f={f} r={r} />} />
        ))}
      </dl>
    </section>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
              aria-label={t("הקודמת", "Previous")}
            >
              {currentLang() === "en" ? "←" : "→"}
            </button>
            <span className="small muted">
              {t(`${index + 1} מתוך ${count}`, `${index + 1} of ${count}`)}
            </span>
            <button
              className="icon"
              onClick={onNext}
              disabled={index >= count - 1}
              aria-label={t("הבאה", "Next")}
            >
              {currentLang() === "en" ? "→" : "←"}
            </button>
          </div>
          <button className="icon" onClick={onClose} aria-label={t("סגירה", "Close")}>
            ×
          </button>
        </div>

        <header className="d-head">
          <Thumb path={firstFile(def, r)} size={72} />
          <div>
            <h2>{title || "—"}</h2>
            <p className="muted">
              {t(`נשלח ${fmtDate(r.created_at)}`, `Sent ${fmtDate(r.created_at)}`)}
              {r.updated_at
                ? t(` · נערך ${fmtDate(r.updated_at)}`, ` · edited ${fmtDate(r.updated_at)}`)
                : ""}
            </p>
          </div>
        </header>

        {dupOf.length > 0 && (
          <div className="dup-note" role="note">
            <b>{t("אולי הרשמה כפולה:", "Possibly a duplicate:")}</b>{" "}
            {t("אותו טלפון או מייל מופיע גם ב-", "The same phone or email also appears in ")}
            {dupOf.map((d, i) => (
              <span key={d.id}>
                {i > 0 ? ", " : ""}
                <button className="link" onClick={() => onOpen(d.id)}>
                  {(listColumns(def)[0] &&
                    answerText(listColumns(def)[0]!, d.answers[listColumns(def)[0]!.id])) ||
                    t("תגובה", "response")}{" "}
                  ({fmtDate(d.created_at)})
                </button>
              </span>
            ))}
            .{" "}
            {t(
              'אם זו אותה הרשמה, אפשר למחוק אחת מהן או לסמן "לא רלוונטי".',
              'If it\'s the same sign-up, delete one or mark it "Not relevant".',
            )}
          </div>
        )}

        <section className="d-sec handle">
          <h3>{t("טיפול (רק אתם רואים)", "Handling (only you see this)")}</h3>
          {v3 === false ? (
            <NeedsUpdate />
          ) : (
            <>
              <label className="handle-row">
                <span className="lbl">{t("סטטוס", "Status")}</span>
                <StatusSelect value={statusOf(r)} onChange={(st) => onMeta({ status: st })} />
              </label>
              <label className="handle-note">
                <span className="lbl">{t("הערה פנימית", "Private note")}</span>
                <textarea
                  rows={3}
                  value={note}
                  placeholder={t(
                    "למשל: דיברנו בטלפון, מחכים ללוגו",
                    "e.g. Spoke on the phone, waiting for the logo",
                  )}
                  onChange={(e) => {
                    setNote(e.target.value);
                    setNoteState("");
                  }}
                  onBlur={saveNote}
                />
                <span className="small muted">
                  {noteState === "saving"
                    ? t("שומר…", "Saving…")
                    : noteState === "saved"
                      ? t("ההערה נשמרה ✓", "Note saved ✓")
                      : t("נשמר אוטומטית כשיוצאים מהתיבה", "Saves when you click outside the box")}
                </span>
              </label>
            </>
          )}
        </section>

        {editing ? (
          <section className="d-sec">
            <h3>{t("עריכת התשובות", "Edit the answers")}</h3>
            <p className="small muted">
              {t(
                "מתקנים מה שצריך ולוחצים שמירה. קובץ חדש מחליף את הקובץ הקיים באותה שאלה.",
                "Fix what you need and save. A new file replaces the existing file for that question.",
              )}
            </p>
            <FormRenderer
              def={def}
              template={form.template}
              accent={form.accent}
              mode="admin"
              initial={r.answers}
              existingFiles={r.files}
              submitLabel={t("שמירת השינויים", "Save changes")}
              onCancel={() => setEditing(false)}
              onSubmit={saveEdit}
            />
          </section>
        ) : (
          def.sections.map((s) => section(s.title, s.fields, s.id))
        )}
        {hasSum(def) && (
          <section className="d-sec">
            <dl>
              <Kv k={t("סכום כולל", "Total")} v={<b>{fmtN(sumTotal(def, r.answers))}</b>} />
            </dl>
          </section>
        )}
        {removed.length > 0 &&
          section(t("שאלות שהוסרו מהטופס מאז", "Questions removed since"), removed, "removed")}

        <footer className="d-foot">
          {!editing && (
            <button className="btn" onClick={() => setEditing(true)}>
              {t("עריכת התשובות", "Edit answers")}
            </button>
          )}
          <button className="btn" onClick={copyAll}>
            {copied ? t("הועתק ✓", "Copied ✓") : t("העתקת כל הפרטים", "Copy all details")}
          </button>
          {!confirmDel ? (
            <button className="btn danger-ghost" onClick={() => setConfirmDel(true)}>
              {t("מחיקת התגובה", "Delete response")}
            </button>
          ) : (
            <div className="confirm" role="alert">
              <span>
                {t(
                  "למחוק את התגובה הזו? אי אפשר לבטל.",
                  "Delete this response? This can't be undone.",
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

/* ---------------- summary ---------------- */

function Bars({ items, total }: { items: { label: string; n: number }[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.label}>
          <span className="bl">{i.label}</span>
          <span className="bt" aria-hidden="true">
            <span className="bf" style={{ width: `${(i.n / max) * 100}%` }} />
          </span>
          <span className="bn num">
            {fmtN(i.n)}
            <span className="muted small"> ({total ? Math.round((i.n / total) * 100) : 0}%)</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Summary({ def, rows }: { def: FormDef; rows: ResponseRow[] }) {
  const t = useT();
  const total = rows.length;
  const week = rows.filter(
    (r) => Date.now() - new Date(r.created_at).getTime() < 7 * 86400000,
  ).length;
  const today = rows.filter((r) => sameDay(new Date(r.created_at), new Date())).length;

  const days = useMemo(() => {
    const out: { key: string; label: string; n: number }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000);
      out.push({
        key: d.toDateString(),
        label: d.toLocaleDateString(currentLang() === "en" ? "en-GB" : "he-IL", {
          day: "numeric",
          month: "numeric",
        }),
        n: 0,
      });
    }
    const idx = new Map(out.map((d, i) => [d.key, i]));
    for (const r of rows) {
      const k = new Date(r.created_at);
      k.setHours(0, 0, 0, 0);
      const i = idx.get(k.toDateString());
      if (i != null) out[i]!.n++;
    }
    return out;
  }, [rows]);
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  if (!total)
    return (
      <div className="card empty">
        <h2>{t("עוד אין נתונים", "No data yet")}</h2>
        <p className="muted">
          {t("הסיכום יתמלא ברגע שיגיעו תגובות.", "The summary fills in once responses arrive.")}
        </p>
      </div>
    );

  return (
    <div className="summary">
      <section className="stats four">
        <Stat label={t("סך תגובות", "Total responses")} value={fmtN(total)} />
        <Stat label={t("היום", "Today")} value={fmtN(today)} />
        <Stat label={t("7 הימים האחרונים", "Last 7 days")} value={fmtN(week)} />
        {hasSum(def) ? (
          <Stat
            label={t("סכום כולל", "Grand total")}
            value={fmtN(rows.reduce((n, r) => n + sumTotal(def, r.answers), 0))}
          />
        ) : (
          <Stat
            label={t("ממוצע ליום (30 יום)", "Daily average (30d)")}
            value={(days.reduce((n, d) => n + d.n, 0) / 30).toFixed(1)}
          />
        )}
      </section>

      <section className="card sum-card">
        <h3>{t("תגובות לפי יום, 30 הימים האחרונים", "Responses per day, last 30 days")}</h3>
        <div
          className="daychart"
          role="img"
          aria-label={t("גרף תגובות לפי יום", "Responses per day chart")}
        >
          {days.map((d, i) => (
            <div key={d.key} className="dc-col" title={`${d.label}: ${d.n}`}>
              <span className="dc-n small">{d.n || ""}</span>
              <span className="dc-bar" style={{ height: `${(d.n / maxDay) * 100}%` }} />
              <span className="dc-l small muted">{i % 5 === 4 || i === 29 ? d.label : ""}</span>
            </div>
          ))}
        </div>
      </section>

      {def.sections.map((s) =>
        s.fields.map((f) => (
          <QuestionSummary key={f.id} f={f} rows={rows} total={total} section={s.title} />
        )),
      )}
    </div>
  );
}

function QuestionSummary({
  f,
  rows,
  total,
  section,
}: {
  f: Field;
  rows: ResponseRow[];
  total: number;
  section: string;
}) {
  const t = useT();
  const label = f.label || section;
  const answered = rows.filter((r) => {
    const v = r.answers[f.id];
    if (f.type === "file") return (r.files[f.id] ?? []).length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== "";
  });
  const head = (
    <div className="qs-head">
      <h3>{label}</h3>
      <span className="small muted">
        {t(
          `${fmtN(answered.length)} מתוך ${fmtN(total)} ענו`,
          `${fmtN(answered.length)} of ${fmtN(total)} answered`,
        )}
      </span>
    </div>
  );

  if (hasOptions(f.type) || f.type === "yesno") {
    const opts = f.type === "yesno" ? ["כן", "לא"] : (f.options ?? []);
    const counts = new Map<string, number>(opts.map((o) => [o, 0]));
    for (const r of rows) {
      const v = r.answers[f.id];
      const vals = isStrList(v ?? null) ? (v as string[]) : typeof v === "string" && v ? [v] : [];
      for (const x of vals) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    const items = [...counts.entries()]
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n);
    return (
      <section className="card sum-card">
        {head}
        <Bars items={items} total={answered.length} />
        {f.type === "multi" && (
          <p className="small muted">
            {t(
              "אפשר היה לבחור יותר מאפשרות אחת, לכן האחוזים לא מסתכמים ל-100.",
              "More than one option could be picked, so percentages don't add up to 100.",
            )}
          </p>
        )}
      </section>
    );
  }

  if (f.type === "number") {
    const nums = answered
      .map((r) => r.answers[f.id])
      .filter((x): x is number => typeof x === "number");
    const sum = nums.reduce((a, b) => a + b, 0);
    // Years (e.g. "year founded") read better without thousand separators or a sum.
    const years =
      nums.length > 0 && nums.every((x) => Number.isInteger(x) && x >= 1900 && x <= 2100);
    const show = (x: number) => (years ? String(Math.round(x)) : fmtN(x));
    return (
      <section className="card sum-card">
        {head}
        <dl className="numstats">
          {!years && (
            <div>
              <dt>{t("סכום", "Sum")}</dt>
              <dd>{fmtN(sum)}</dd>
            </div>
          )}
          <div>
            <dt>{t("ממוצע", "Average")}</dt>
            <dd>{nums.length ? show(Math.round((sum / nums.length) * 10) / 10) : "—"}</dd>
          </div>
          <div>
            <dt>{t("הכי נמוך", "Lowest")}</dt>
            <dd>{nums.length ? show(Math.min(...nums)) : "—"}</dd>
          </div>
          <div>
            <dt>{t("הכי גבוה", "Highest")}</dt>
            <dd>{nums.length ? show(Math.max(...nums)) : "—"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  if (f.type === "file" || f.type === "people") {
    const people =
      f.type === "people"
        ? answered.reduce(
            (n, r) => n + ((r.answers[f.id] as PersonAnswer[] | undefined)?.length ?? 0),
            0,
          )
        : 0;
    return (
      <section className="card sum-card compact">
        {head}
        {f.type === "people" && (
          <p className="small muted">
            {t(`סה״כ ${fmtN(people)} אנשים ברשימות`, `${fmtN(people)} people listed in total`)}
          </p>
        )}
      </section>
    );
  }

  const latest = answered.slice(0, 3).map((r) => answerText(f, r.answers[f.id]));
  return (
    <section className="card sum-card">
      {head}
      {latest.length > 0 && (
        <ul className="latest">
          {latest.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Excel ---------------- */

function exportTable(
  def: FormDef,
  rows: ResponseRow[],
  links: Map<string, string>,
  withMeta: boolean,
  dups: Map<string, Set<string>>,
): { columns: XlsxColumn[]; data: XlsxCell[][] } {
  const columns: XlsxColumn[] = [{ header: "תאריך שליחה", width: 17 }];
  type Getter = (r: ResponseRow) => XlsxCell[];
  const getters: Getter[] = [];
  const all = [...allFields(def)];
  const known = new Set(all.map((f) => f.id));
  for (const r of rows) {
    for (const id of Object.keys({ ...r.answers, ...r.files })) {
      if (!known.has(id)) {
        known.add(id);
        all.push({
          id,
          type: r.files[id] ? "file" : "short",
          label: `${r.labels[id] || id} (הוסרה)`,
        });
      }
    }
  }
  for (const f of all) {
    const label = f.label || (f.type === "people" ? "איש קשר" : "תשובה");
    if (f.type === "people") {
      const max = Math.max(
        1,
        ...rows.map((r) =>
          isPeople(r.answers[f.id] ?? null) ? (r.answers[f.id] as PersonAnswer[]).length : 0,
        ),
      );
      for (let i = 0; i < max; i++) {
        columns.push(
          { header: `${label} ${i + 1} – שם`, width: 16 },
          { header: `${label} ${i + 1} – טלפון`, width: 14 },
          { header: `${label} ${i + 1} – מייל`, width: 24 },
        );
      }
      getters.push((r) => {
        const ps = isPeople(r.answers[f.id] ?? null) ? (r.answers[f.id] as PersonAnswer[]) : [];
        const out: XlsxCell[] = [];
        for (let i = 0; i < max; i++)
          out.push(ps[i]?.name || null, ps[i]?.phone || null, ps[i]?.email || null);
        return out;
      });
    } else if (f.type === "file") {
      columns.push({ header: `${label} (קישור ל-7 ימים)`, width: 30 });
      getters.push((r) => [(r.files[f.id] ?? []).map((p) => links.get(p) ?? p).join("\n") || null]);
    } else if (f.type === "number") {
      columns.push({ header: label, width: 14 });
      getters.push((r) => [
        typeof r.answers[f.id] === "number" ? (r.answers[f.id] as number) : null,
      ]);
    } else {
      const wide = f.type === "long" || f.type === "multi";
      columns.push({ header: label, width: wide ? 34 : 18, wrap: wide });
      getters.push((r) => [answerText(f, r.answers[f.id]) || null]);
    }
  }
  if (hasSum(def)) {
    columns.push({ header: "סכום כולל", width: 12 });
    getters.push((r) => [sumTotal(def, r.answers)]);
  }
  if (withMeta) {
    columns.push({ header: "סטטוס", width: 12 }, { header: "הערה פנימית", width: 30, wrap: true });
    getters.push((r) => [
      RESPONSE_STATUSES.find((x) => x.id === statusOf(r))!.he,
      r.notes?.trim() || null,
    ]);
  }
  if (dups.size) {
    columns.push({ header: "כפול אפשרי", width: 11 });
    getters.push((r) => [dups.has(r.id) ? "כן" : null]);
  }
  const data = rows.map((r) => [new Date(r.created_at), ...getters.flatMap((g) => g(r))]);
  return { columns, data };
}
