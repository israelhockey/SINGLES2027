import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteForm,
  getForm,
  isSlugFree,
  publishForm,
  saveDraft,
  setFormStatus,
  setHomeForm,
  setPreviewToken,
} from "@/forms/api";
import { FormRenderer } from "@/forms/FormRenderer";
import { ALIAS_RE, cleanSlug, slugProblem, suggestAlias } from "@/forms/links";
import { createTinyLink } from "@/forms/shorten";
import { ACCENTS, templateOf } from "@/forms/templates";
import {
  FIELD_TYPES,
  allFields,
  cloneField,
  cloneSection,
  hasOptions,
  newField,
  newSection,
  type Field,
  type FieldType,
  type FormDef,
  type FormRow,
  type FormSettings,
  type FormTexts,
  type FormVersion,
  type Section,
  type TemplateId,
} from "@/forms/types";
import { AdminTop, CopyLink, TemplatePicker, formLink, hasUnpublished } from "./FormsHome";
import { rememberTinyLink } from "./LinkShortener";
import { NeedsUpdate, currentLang, fmtDate, useT, useUpdate3 } from "./shared";

type SaveState = "saved" | "dirty" | "saving" | "error";
type Tab = "questions" | "texts" | "design" | "versions";

const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j]!, a[i]!];
  return a;
};

const typeName = (t: FieldType) => {
  const x = FIELD_TYPES.find((f) => f.type === t)!;
  return currentLang() === "en" ? x.en : x.he;
};

export function FormEditor({ formId }: { formId: string }) {
  const t = useT();
  const [row, setRow] = useState<FormRow | null | undefined>(undefined);
  const [draft, setDraft] = useState<FormDef | null>(null);
  const [title, setTitle] = useState("");
  const [save, setSave] = useState<SaveState>("saved");
  const [tab, setTab] = useState<Tab>("questions");
  const [showPreview, setShowPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ draft?: FormDef; title?: string }>({});

  useEffect(() => {
    getForm(formId)
      .then((f) => {
        setRow(f);
        if (f) {
          setDraft(f.draft);
          setTitle(f.title);
        }
      })
      .catch(() => setRow(null));
  }, [formId]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const p = pending.current;
    pending.current = {};
    if (!p.draft && p.title === undefined) return true;
    setSave("saving");
    try {
      await saveDraft(formId, {
        ...(p.draft ? { draft: p.draft } : {}),
        ...(p.title !== undefined ? { title: p.title } : {}),
      });
      setRow((r) =>
        r
          ? {
              ...r,
              ...(p.draft ? { draft: p.draft } : {}),
              ...(p.title !== undefined ? { title: p.title } : {}),
            }
          : r,
      );
      setSave("saved");
      return true;
    } catch (e) {
      console.error(e);
      pending.current = { ...p, ...pending.current };
      setSave("error");
      return false;
    }
  }, [formId]);

  const schedule = useCallback(() => {
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current.draft || pending.current.title !== undefined) {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (d: FormDef) => FormDef) => {
      setDraft((d) => {
        if (!d) return d;
        const next = fn(structuredClone(d));
        pending.current.draft = next;
        return next;
      });
      schedule();
    },
    [schedule],
  );

  const changeTitle = (v: string) => {
    setTitle(v);
    pending.current.title = v;
    schedule();
  };

  /** Settings that apply right away (design, color, link, status). */
  const applyNow = async (patch: Partial<FormRow>, fn: () => Promise<unknown>) => {
    setRow((r) => (r ? { ...r, ...patch } : r));
    try {
      await fn();
      setNotice("");
    } catch (e) {
      console.error(e);
      setNotice(t("השמירה נכשלה. נסו שוב.", "Saving failed. Try again."));
    }
  };

  const publish = async () => {
    if (!draft || !row) return;
    const problems = checkDraft(draft, t);
    if (problems.length) {
      setNotice(problems.join(" "));
      return;
    }
    setPublishing(true);
    const ok = await flush();
    if (ok) {
      try {
        const history = await publishForm(row, draft);
        setRow((r) =>
          r ? { ...r, published: draft, published_at: new Date().toISOString(), history } : r,
        );
        setNotice(t("פורסם ✓ הגרסה החדשה באוויר.", "Published ✓ The new version is live."));
      } catch (e) {
        console.error(e);
        setNotice(t("הפרסום נכשל. נסו שוב.", "Publishing failed. Try again."));
      }
    }
    setPublishing(false);
  };

  /** Throws away unpublished changes: the draft becomes the live version again. */
  const discardChanges = () => {
    if (!row?.published) return;
    if (
      !window.confirm(
        t(
          "לבטל את כל השינויים שעוד לא פורסמו? הטיוטה תחזור להיות בדיוק כמו הטופס שבאוויר.",
          "Discard all unpublished changes? The draft goes back to exactly what is live.",
        ),
      )
    )
      return;
    const live = structuredClone(row.published);
    update((d) => ({ ...live, ...(d.share ? { share: d.share } : {}) }));
    setNotice(t("השינויים בוטלו ✓ הטיוטה זהה לטופס שבאוויר.", "Changes discarded ✓"));
  };

  /** Loads an earlier version into the draft (it goes live only after "Publish"). */
  const restoreVersion = (v: FormVersion) => {
    if (
      !window.confirm(
        t(
          `לטעון את הגרסה מ-${fmtDate(v.at)} לטיוטה? הטופס שבאוויר לא ישתנה עד שתלחצו "פרסום".`,
          `Load the version from ${fmtDate(v.at)} into the draft? The live form won't change until you click Publish.`,
        ),
      )
    )
      return;
    const old = structuredClone(v.def);
    update((d) => {
      if (d.share)
        old.share = d.share; // the tiny link belongs to the form, keep it
      else delete old.share;
      return old;
    });
    setTab("questions");
    setNotice(
      t(
        'הגרסה נטענה לטיוטה ✓ בדקו בתצוגה המקדימה ולחצו "פרסום השינויים" כדי שתעלה לאוויר.',
        'Version loaded into the draft ✓ Check the preview, then click "Publish changes" to make it live.',
      ),
    );
  };

  if (row === null)
    return (
      <div className="dash">
        <AdminTop title={t("הטופס לא נמצא", "Form not found")} />
        <Link to="/admin">{t("← חזרה לטפסים", "← Back to forms")}</Link>
      </div>
    );
  if (!row || !draft) return <p className="center muted">{t("טוען…", "Loading…")}</p>;

  const live = !!row.published;
  const changed = hasUnpublished({ ...row, draft });
  const saveLabel: Record<SaveState, string> = {
    saved: t("הטיוטה נשמרה", "Draft saved"),
    dirty: t("שינויים…", "Editing…"),
    saving: t("שומר…", "Saving…"),
    error: t("השמירה נכשלה, מנסה שוב", "Save failed, retrying"),
  };

  return (
    <div className="editor">
      <div className="ed-main">
        <nav className="crumbs small">
          <Link to="/admin">{t("הטפסים שלי", "My forms")}</Link> <span aria-hidden="true">/</span>{" "}
          <Link to="/admin/forms/$formId" params={{ formId }}>
            {title || draft.texts.title}
          </Link>{" "}
          <span aria-hidden="true">/</span> {t("עריכה", "Edit")}
        </nav>

        <div className="ed-bar card">
          <input
            className="ed-title"
            aria-label={t("שם הטופס", "Form name")}
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            placeholder={t("שם הטופס", "Form name")}
          />
          <div className="ed-bar-row">
            <span className={`save-state ${save}`} role="status">
              {saveLabel[save]}
            </span>
            {live ? (
              changed ? (
                <span className="pill warn">
                  {t("יש שינויים שלא פורסמו", "Unpublished changes")}
                </span>
              ) : (
                <span className="pill open">
                  {t("הגרסה באוויר מעודכנת", "Live version is up to date")}
                </span>
              )
            ) : (
              <span className="pill draft">{t("עוד לא פורסם", "Not published yet")}</span>
            )}
            <div className="spacer" />
            {live && changed && (
              <button
                className="btn"
                onClick={discardChanges}
                title={t(
                  "מחזיר את הטיוטה למה שבאוויר עכשיו",
                  "Puts the draft back to what is live now",
                )}
              >
                ↶ {t("ביטול השינויים", "Discard changes")}
              </button>
            )}
            <button className="btn preview-toggle" onClick={() => setShowPreview(true)}>
              {t("תצוגה מקדימה", "Preview")}
            </button>
            <button
              className="btn primary"
              onClick={publish}
              disabled={publishing || (live && !changed && save === "saved")}
            >
              {publishing
                ? t("מפרסם…", "Publishing…")
                : live
                  ? t("פרסום השינויים", "Publish changes")
                  : t("פרסום הטופס", "Publish form")}
            </button>
          </div>
          {row.published_at && (
            <p className="small muted">
              {t(
                `פורסם לאחרונה ${fmtDate(row.published_at)}`,
                `Last published ${fmtDate(row.published_at)}`,
              )}
            </p>
          )}
          <p className="small muted ed-explain">
            {t(
              'כל שינוי נשמר לבד כטיוטה. אנשים שממלאים את הטופס רואים את השינויים רק אחרי שלוחצים "פרסום".',
              'Every change saves itself as a draft. People filling in the form see changes only after you click "Publish".',
            )}
          </p>
          {notice && (
            <p className={`msg ${notice.includes("✓") ? "ok" : "err"}`} role="status">
              {notice}
            </p>
          )}
        </div>

        <div className="tabs" role="tablist">
          {(
            [
              ["questions", t("שאלות", "Questions")],
              ["texts", t("טקסטים", "Texts")],
              ["design", t("עיצוב והגדרות", "Design & settings")],
              ["versions", t("גרסאות קודמות", "Version history")],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={tab === k ? "on" : ""}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "questions" && <QuestionsTab draft={draft} update={update} />}
        {tab === "texts" && <TextsTab draft={draft} update={update} template={row.template} />}
        {tab === "design" && (
          <DesignTab row={row} draft={draft} update={update} applyNow={applyNow} setRow={setRow} />
        )}
        {tab === "versions" && <VersionsTab row={row} onRestore={restoreVersion} />}
      </div>

      <aside
        className={`ed-preview${showPreview ? " open" : ""}`}
        aria-label={t("תצוגה מקדימה", "Preview")}
      >
        <div className="ed-preview-bar">
          <b>{t("תצוגה מקדימה של הטיוטה", "Draft preview")}</b>
          <button className="btn preview-close" onClick={() => setShowPreview(false)}>
            {t("סגירה", "Close")}
          </button>
        </div>
        <div className="ed-preview-frame">
          <FormRenderer def={draft} template={row.template} accent={row.accent} mode="preview" />
        </div>
      </aside>
    </div>
  );
}

function checkDraft(d: FormDef, t: (he: string, en: string) => string) {
  const out: string[] = [];
  const fields = allFields(d);
  if (!fields.length)
    out.push(t("צריך לפחות שאלה אחת לפני פרסום.", "Add at least one question before publishing."));
  const noLabel = fields.filter((f) => !f.label.trim() && f.type !== "people").length;
  if (noLabel) out.push(t(`ל-${noLabel} שאלות אין כותרת.`, `${noLabel} questions have no title.`));
  const noOpts = fields.filter(
    (f) => hasOptions(f.type) && !(f.options ?? []).filter((o) => o.trim()).length,
  ).length;
  if (noOpts)
    out.push(
      t(`ל-${noOpts} שאלות בחירה אין אפשרויות.`, `${noOpts} choice questions have no options.`),
    );
  return out;
}

/* ---------------- questions ---------------- */

function QuestionsTab({
  draft,
  update,
}: {
  draft: FormDef;
  update: (fn: (d: FormDef) => FormDef) => void;
}) {
  const t = useT();
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const setSection = (si: number, patch: Partial<Section>) =>
    update((d) => {
      d.sections[si] = { ...d.sections[si]!, ...patch };
      return d;
    });
  const setField = (si: number, fi: number, patch: Partial<Field>) =>
    update((d) => {
      d.sections[si]!.fields[fi] = { ...d.sections[si]!.fields[fi]!, ...patch };
      return d;
    });

  return (
    <div className="q-list">
      {draft.sections.map((s, si) => (
        <section className="ed-section card" key={s.id}>
          <div className="es-head">
            <span className="es-n">{si + 1}</span>
            <div className="es-fields">
              <input
                className="es-title"
                aria-label={t("כותרת החלק", "Section title")}
                value={s.title}
                onChange={(e) => setSection(si, { title: e.target.value })}
                placeholder={t("כותרת החלק", "Section title")}
              />
              <input
                className="es-sub"
                aria-label={t("שורת משנה", "Subtitle")}
                value={s.subtitle ?? ""}
                onChange={(e) => setSection(si, { subtitle: e.target.value })}
                placeholder={t("שורת משנה (לא חובה)", "Subtitle (optional)")}
              />
            </div>
            <div className="mini-actions">
              <button
                className="icon sm"
                title={t("הזזה למעלה", "Move up")}
                aria-label={t("הזזה למעלה", "Move up")}
                disabled={si === 0}
                onClick={() => update((d) => ({ ...d, sections: move(d.sections, si, -1) }))}
              >
                ↑
              </button>
              <button
                className="icon sm"
                title={t("הזזה למטה", "Move down")}
                aria-label={t("הזזה למטה", "Move down")}
                disabled={si === draft.sections.length - 1}
                onClick={() => update((d) => ({ ...d, sections: move(d.sections, si, 1) }))}
              >
                ↓
              </button>
              <button
                className="icon sm"
                title={t("שכפול החלק", "Duplicate section")}
                aria-label={t("שכפול החלק", "Duplicate section")}
                onClick={() =>
                  update((d) => {
                    d.sections.splice(si + 1, 0, cloneSection(s));
                    return d;
                  })
                }
              >
                ⧉
              </button>
              <button
                className="icon sm danger"
                title={t("מחיקת החלק", "Delete section")}
                aria-label={t("מחיקת החלק", "Delete section")}
                disabled={draft.sections.length <= 1}
                onClick={() => {
                  if (
                    s.fields.length &&
                    !window.confirm(
                      t(
                        `למחוק את החלק "${s.title}" עם ${s.fields.length} השאלות שבו?`,
                        `Delete section "${s.title}" and its ${s.fields.length} questions?`,
                      ),
                    )
                  )
                    return;
                  update((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== si) }));
                }}
              >
                ×
              </button>
            </div>
          </div>
          {s.fields.some((f) => f.type === "number" && f.sum) && (
            <label className="es-sum small">
              {t("כותרת תיבת הסכום:", "Total box label:")}
              <input
                value={s.sumLabel ?? ""}
                onChange={(e) => setSection(si, { sumLabel: e.target.value })}
                placeholder={t("סך הכל", "Total")}
              />
            </label>
          )}

          <ol className="fields">
            {s.fields.map((f, fi) => (
              <li key={f.id} className={`q-card${openQ === f.id ? " open" : ""}`}>
                <button
                  type="button"
                  className="q-sum"
                  onClick={() => setOpenQ(openQ === f.id ? null : f.id)}
                  aria-expanded={openQ === f.id}
                >
                  <span className="q-type small">{typeName(f.type)}</span>
                  <span className="q-label">
                    {f.label || (
                      <span className="muted">{t("שאלה ללא כותרת", "Untitled question")}</span>
                    )}
                    {f.required && <span className="req"> *</span>}
                  </span>
                  <span className="chev" aria-hidden="true">
                    {openQ === f.id ? "−" : "+"}
                  </span>
                </button>
                {openQ === f.id && (
                  <FieldEditor
                    f={f}
                    onChange={(p) => setField(si, fi, p)}
                    onMove={(dir) =>
                      update((d) => {
                        const sec = d.sections[si]!;
                        const j = fi + dir;
                        if (j >= 0 && j < sec.fields.length) sec.fields = move(sec.fields, fi, dir);
                        else if (j < 0 && si > 0) {
                          const [x] = sec.fields.splice(fi, 1);
                          d.sections[si - 1]!.fields.push(x!);
                        } else if (j >= sec.fields.length && si < d.sections.length - 1) {
                          const [x] = sec.fields.splice(fi, 1);
                          d.sections[si + 1]!.fields.unshift(x!);
                        }
                        return d;
                      })
                    }
                    canUp={fi > 0 || si > 0}
                    canDown={fi < s.fields.length - 1 || si < draft.sections.length - 1}
                    onDuplicate={() => {
                      const c = cloneField(f);
                      update((d) => {
                        d.sections[si]!.fields.splice(fi + 1, 0, c);
                        return d;
                      });
                      setOpenQ(c.id);
                    }}
                    onDelete={() =>
                      update((d) => {
                        d.sections[si]!.fields.splice(fi, 1);
                        d.listFields = d.listFields.filter((id) => id !== f.id);
                        return d;
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ol>

          {adding === s.id ? (
            <div className="type-picker">
              <span className="small muted">{t("איזה סוג שאלה?", "Which kind of question?")}</span>
              <div className="type-grid">
                {FIELD_TYPES.map((ft) => (
                  <button
                    key={ft.type}
                    className="btn"
                    onClick={() => {
                      const nf = newField(ft.type);
                      update((d) => {
                        d.sections[si]!.fields.push(nf);
                        return d;
                      });
                      setAdding(null);
                      setOpenQ(nf.id);
                    }}
                  >
                    {currentLang() === "en" ? ft.en : ft.he}
                  </button>
                ))}
              </div>
              <button className="link" onClick={() => setAdding(null)}>
                {t("ביטול", "Cancel")}
              </button>
            </div>
          ) : (
            <button className="add-q" onClick={() => setAdding(s.id)}>
              + {t("הוספת שאלה", "Add question")}
            </button>
          )}
        </section>
      ))}
      <button
        className="btn add-section"
        onClick={() => update((d) => ({ ...d, sections: [...d.sections, newSection()] }))}
      >
        + {t("הוספת חלק חדש", "Add section")}
      </button>
    </div>
  );
}

function FieldEditor({
  f,
  onChange,
  onMove,
  canUp,
  canDown,
  onDuplicate,
  onDelete,
}: {
  f: Field;
  onChange: (p: Partial<Field>) => void;
  onMove: (d: number) => void;
  canUp: boolean;
  canDown: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const withPlaceholder = ["short", "long", "number", "phone", "email", "dropdown"].includes(
    f.type,
  );
  const opts = f.options ?? [];
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const pastedList = pasted
    .split(/\r?\n/)
    .map((x) => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  const pastedNew = pastedList.filter((x, i) => pastedList.indexOf(x) === i && !opts.includes(x));
  const addPasted = (replace: boolean) => {
    const base = replace ? [] : opts.filter((o) => o.trim());
    const next = [...base];
    for (const x of pastedList) if (!next.includes(x)) next.push(x);
    onChange({ options: next });
    setPasted("");
    setPasting(false);
  };

  const changeType = (type: FieldType) => {
    const p: Partial<Field> = { type };
    if (hasOptions(type) && !opts.length) p.options = ["אפשרות 1", "אפשרות 2"];
    onChange(p);
  };

  return (
    <div className="q-edit">
      <div className="qe-row">
        <label className="grow">
          <span className="lbl">{t("השאלה", "Question")}</span>
          <input
            value={f.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={t("למשל: שם הקהילה", "e.g. Community name")}
            autoFocus
          />
        </label>
        <label>
          <span className="lbl">{t("סוג", "Type")}</span>
          <select value={f.type} onChange={(e) => changeType(e.target.value as FieldType)}>
            {FIELD_TYPES.map((ft) => (
              <option key={ft.type} value={ft.type}>
                {currentLang() === "en" ? ft.en : ft.he}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        <span className="lbl">
          {t("הסבר קטן מתחת לשאלה (לא חובה)", "Help text under the question (optional)")}
        </span>
        <input value={f.help ?? ""} onChange={(e) => onChange({ help: e.target.value })} />
      </label>

      {withPlaceholder && (
        <label>
          <span className="lbl">
            {t("טקסט לדוגמה בתוך השדה (לא חובה)", "Example text inside the field (optional)")}
          </span>
          <input
            value={f.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
          />
        </label>
      )}

      {hasOptions(f.type) && (
        <div className="opts">
          <span className="lbl">{t("אפשרויות", "Options")}</span>
          {opts.map((o, i) => (
            <div className="opt" key={i}>
              <span className="opt-dot" aria-hidden="true">
                {f.type === "multi" ? "☐" : "○"}
              </span>
              <input
                aria-label={t(`אפשרות ${i + 1}`, `Option ${i + 1}`)}
                value={o}
                onChange={(e) =>
                  onChange({ options: opts.map((x, j) => (j === i ? e.target.value : x)) })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const n = [...opts];
                    n.splice(i + 1, 0, "");
                    onChange({ options: n });
                  }
                }}
              />
              <button
                className="icon sm"
                aria-label={t("למעלה", "Up")}
                disabled={i === 0}
                onClick={() => onChange({ options: move(opts, i, -1) })}
              >
                ↑
              </button>
              <button
                className="icon sm"
                aria-label={t("הסרה", "Remove")}
                onClick={() => onChange({ options: opts.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="opt-links">
            <button className="link" onClick={() => onChange({ options: [...opts, ""] })}>
              + {t("הוספת אפשרות", "Add option")}
            </button>
            <button className="link" onClick={() => setPasting((x) => !x)}>
              {t("הדבקת רשימה שלמה", "Paste a whole list")}
            </button>
          </div>
          {pasting && (
            <div className="paste-box">
              <span className="small muted">
                {t(
                  "הדביקו כאן רשימה, כל אפשרות בשורה נפרדת (למשל רשימת ערים מאקסל או מוואטסאפ).",
                  "Paste a list here, one option per line (e.g. a list of cities from Excel or WhatsApp).",
                )}
              </span>
              <textarea
                rows={6}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                aria-label={t("רשימת אפשרויות", "List of options")}
                placeholder={"תל אביב\nחיפה\nירושלים"}
                autoFocus
              />
              <div className="row-btns">
                <button
                  className="btn primary"
                  disabled={!pastedNew.length}
                  onClick={() => addPasted(false)}
                >
                  {t(`הוספת ${pastedNew.length} אפשרויות`, `Add ${pastedNew.length} options`)}
                </button>
                <button
                  className="btn"
                  disabled={!pastedList.length}
                  onClick={() => addPasted(true)}
                >
                  {t("החלפת כל הרשימה", "Replace the whole list")}
                </button>
                <button className="link" onClick={() => setPasting(false)}>
                  {t("ביטול", "Cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="qe-toggles">
        <label className="check">
          <input
            type="checkbox"
            checked={!!f.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          {t("חובה לענות", "Required")}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={f.width === "half"}
            onChange={(e) => onChange({ width: e.target.checked ? "half" : "full" })}
          />
          {t("חצי רוחב (שתי שאלות בשורה)", "Half width (two per row)")}
        </label>
        {f.type === "long" && (
          <label className="check">
            {t("מקסימום מילים:", "Max words:")}
            <input
              className="tiny"
              inputMode="numeric"
              value={f.maxWords || ""}
              placeholder={t("ללא", "none")}
              onChange={(e) =>
                onChange({ maxWords: parseInt(e.target.value.replace(/\D/g, ""), 10) || 0 })
              }
            />
          </label>
        )}
        {f.type === "number" && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={!!f.sum}
                onChange={(e) => onChange({ sum: e.target.checked })}
              />
              {t("לכלול בתיבת הסכום", "Include in the total box")}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!f.percent}
                onChange={(e) => onChange({ percent: e.target.checked })}
              />
              {t("אחוזים (%)", "Percent (%)")}
            </label>
          </>
        )}
      </div>

      <div className="qe-actions">
        <button className="btn" disabled={!canUp} onClick={() => onMove(-1)}>
          ↑ {t("למעלה", "Up")}
        </button>
        <button className="btn" disabled={!canDown} onClick={() => onMove(1)}>
          ↓ {t("למטה", "Down")}
        </button>
        <button className="btn" onClick={onDuplicate}>
          {t("שכפול", "Duplicate")}
        </button>
        <div className="spacer" />
        <button className="btn danger-ghost" onClick={onDelete}>
          {t("מחיקת השאלה", "Delete question")}
        </button>
      </div>
    </div>
  );
}

/* ---------------- texts ---------------- */

function TextsTab({
  draft,
  update,
  template,
}: {
  draft: FormDef;
  update: (fn: (d: FormDef) => FormDef) => void;
  template: TemplateId;
}) {
  const t = useT();
  const tpl = templateOf(template);
  const en = currentLang() === "en";
  const set = (k: keyof FormTexts, v: string) =>
    update((d) => {
      d.texts[k] = v;
      return d;
    });
  const done = draft.settings?.doneButton;
  const setDone = (p: Partial<{ label: string; url: string }>) =>
    update((d) => {
      const cur = d.settings?.doneButton ?? { label: "", url: "" };
      const next = { ...cur, ...p };
      d.settings = {
        ...d.settings,
        doneButton: next.label || next.url ? next : undefined,
      };
      return d;
    });
  const field = (
    k: keyof FormTexts,
    he: string,
    enL: string,
    opts: { long?: boolean; hint?: string } = {},
  ) => (
    <label key={k}>
      <span className="lbl">{t(he, enL)}</span>
      {opts.long ? (
        <textarea rows={3} value={draft.texts[k]} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input value={draft.texts[k]} onChange={(e) => set(k, e.target.value)} />
      )}
      {opts.hint && <span className="small muted">{opts.hint}</span>}
    </label>
  );
  return (
    <div className="texts card">
      <h3>{t("ראש הדף", "Top of the page")}</h3>
      {field("kicker", en ? tpl.kickerEn : tpl.kickerHe, en ? tpl.kickerEn : tpl.kickerHe)}
      {field("headline", "הכותרת הגדולה", "Big headline")}
      {field("year", "שנה / תגית", "Year / tag")}
      {field("title", "כותרת הדף", "Page title")}
      {field("lead", "פסקת פתיחה", "Intro paragraph", {
        long: true,
        hint: t(
          "להדגשה: לשים מילים בין כוכביות כפולות, **כך**",
          "To highlight: put words between double stars, **like this**",
        ),
      })}
      {field("cities", "ערים / נקודות (מופרדות בפסיקים)", "Cities / highlights (comma separated)", {
        hint: t("אפשר להשאיר ריק", "Can be left empty"),
      })}
      {field("citiesNote", "הערה קטנה מתחת", "Small note under it")}
      <h3>{t("לפני הטופס", "Before the form")}</h3>
      {field("introTitle", "כותרת", "Heading")}
      {field("introText", "טקסט", "Text", { long: true })}
      <h3>{t("שליחה", "Sending")}</h3>
      {field("consent", "תיבת אישור לפני שליחה", "Consent checkbox", {
        long: true,
        hint: t("אם משאירים ריק, אין תיבת אישור", "Leave empty for no checkbox"),
      })}
      {field("submit", "טקסט כפתור השליחה", "Submit button text")}
      {field("doneTitle", "כותרת אחרי שליחה", "Thank-you title")}
      {field("doneText", "טקסט אחרי שליחה", "Thank-you text", { long: true })}
      <div className="done-btn-set">
        <span className="lbl">
          {t("כפתור במסך התודה (לא חובה)", "Button on the thank-you screen (optional)")}
        </span>
        <div className="qe-row">
          <label className="grow">
            <span className="small muted">{t("מה כתוב על הכפתור", "Button text")}</span>
            <input
              value={done?.label ?? ""}
              placeholder={t("למשל: הצטרפו לקבוצת הוואטסאפ", "e.g. Join our WhatsApp group")}
              onChange={(e) => setDone({ label: e.target.value })}
            />
          </label>
          <label className="grow">
            <span className="small muted">
              {t("לאן הכפתור מוביל (קישור)", "Where it goes (link)")}
            </span>
            <input
              dir="ltr"
              value={done?.url ?? ""}
              placeholder="https://chat.whatsapp.com/…"
              onChange={(e) => setDone({ url: e.target.value.trim() })}
            />
          </label>
        </div>
        <span className="small muted">
          {t(
            "מי שסיים למלא יראה כפתור שמוביל לקישור הזה, למשל קבוצת וואטסאפ, אינסטגרם או אתר. משאירים ריק = אין כפתור.",
            "People who finish see a button to this link, e.g. a WhatsApp group, Instagram or a website. Leave empty for no button.",
          )}
        </span>
      </div>
      <h3>{t("כשהטופס סגור", "When the form is closed")}</h3>
      <p className="small muted">
        {t(
          'מוצג כשסוגרים את הטופס ידנית, כשמגיע תאריך הסגירה או כשמתמלא מספר המקומות (בלשונית "עיצוב והגדרות").',
          'Shown when you close the form, when its closing date arrives or when it is full (see "Design & settings").',
        )}
      </p>
      {field("closedTitle", "כותרת", "Heading")}
      {field("closedText", "טקסט", "Text", { long: true })}
      <h3>{t("תחתית", "Footer")}</h3>
      {field("footer", "שורת קרדיט בתחתית", "Footer credit line")}
    </div>
  );
}

/* ---------------- design & settings ---------------- */

function DesignTab({
  row,
  draft,
  update,
  applyNow,
  setRow,
}: {
  row: FormRow;
  draft: FormDef;
  update: (fn: (d: FormDef) => FormDef) => void;
  applyNow: (patch: Partial<FormRow>, fn: () => Promise<unknown>) => Promise<void>;
  setRow: React.Dispatch<React.SetStateAction<FormRow | null | undefined>>;
}) {
  const t = useT();
  const navigate = useNavigate();
  const tpl = templateOf(row.template);
  const [slug, setSlug] = useState(row.slug);
  const [slugMsg, setSlugMsg] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const fields = useMemo(
    () => allFields(draft).filter((f) => f.type !== "file" && f.type !== "people"),
    [draft],
  );
  const accent = row.accent || tpl.accent;

  const saveSlug = async () => {
    const s = cleanSlug(slug);
    setSlug(s);
    if (s === row.slug) return setSlugMsg("");
    const problem = slugProblem(s);
    if (problem === "reserved")
      return setSlugMsg(
        t("השם הזה שמור לאתר עצמו. בחרו שם אחר.", "That name is used by the site. Pick another."),
      );
    if (problem)
      return setSlugMsg(
        t(
          "רק אותיות באנגלית, מספרים ומקפים (2–60 תווים).",
          "Only English letters, numbers and dashes (2–60).",
        ),
      );
    if (!(await isSlugFree(s, row.id)))
      return setSlugMsg(t("הקישור הזה כבר תפוס.", "That link is taken."));
    await applyNow({ slug: s }, () => saveDraft(row.id, { slug: s }));
    setSlugMsg(
      draft.share
        ? t(
            "הקישור עודכן ✓ שימו לב: הקישור הקצר שיצרתם מפנה לכתובת הקודמת, צרו קישור קצר חדש למטה.",
            "Link updated ✓ Note: your tiny link still points to the old address; make a new one below.",
          )
        : t("הקישור עודכן ✓", "Link updated ✓"),
    );
  };

  return (
    <div className="design">
      <section className="card set-card">
        <h3>{t("עיצוב", "Design")}</h3>
        <p className="small muted">
          {t(
            "העיצוב והצבע מתעדכנים בטופס מיד, גם בלי פרסום.",
            "Design and color update on the live form right away.",
          )}
        </p>
        <TemplatePicker
          value={row.template}
          onChange={(v) => applyNow({ template: v }, () => saveDraft(row.id, { template: v }))}
          preview={() => draft}
          accent={row.accent}
        />
        <span className="lbl">{t("צבע מוביל", "Accent color")}</span>
        <div className="accents">
          {ACCENTS.map((c) => (
            <button
              key={c}
              className={`sw${accent.toLowerCase() === c ? " on" : ""}`}
              style={{ background: c }}
              aria-label={c}
              onClick={() => applyNow({ accent: c }, () => saveDraft(row.id, { accent: c }))}
            />
          ))}
          <label className="sw-custom">
            <input
              type="color"
              value={accent}
              onChange={(e) =>
                applyNow({ accent: e.target.value }, () =>
                  saveDraft(row.id, { accent: e.target.value }),
                )
              }
              aria-label={t("צבע אחר", "Custom color")}
            />
            {t("צבע אחר", "Other")}
          </label>
          {row.accent && (
            <button
              className="link small"
              onClick={() => applyNow({ accent: null }, () => saveDraft(row.id, { accent: null }))}
            >
              {t("חזרה לצבע של העיצוב", "Reset to design color")}
            </button>
          )}
        </div>
      </section>

      <section className="card set-card">
        <h3>{t("קישורים לשיתוף", "Links to share")}</h3>
        <label>
          <span className="lbl">{t("הקישור של הטופס באתר", "The form's link on the site")}</span>
          <div className="slug-row">
            <span className="slug-base" dir="ltr">
              {window.location.host}/
            </span>
            <input
              dir="ltr"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={saveSlug}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            />
          </div>
          <span className="small muted">
            {slugMsg ||
              t(
                "בחרו שם קצר באנגלית, למשל hafakot-2027. הקישור הישן עם ‎/f/‎ ממשיך לעבוד.",
                "Pick a short English name, e.g. hafakot-2027. Old /f/ links keep working.",
              )}
          </span>
        </label>
        <div className="set-actions">
          {row.published && <CopyLink url={formLink(row.slug)} />}
          {row.published && (
            <a className="btn" href={`/${row.slug}`} target="_blank" rel="noopener noreferrer">
              {t("פתיחת הטופס החי", "Open live form")}
            </a>
          )}
        </div>
        {row.is_home && (
          <p className="small muted">
            {t(
              `הטופס מוצג גם בעמוד הבית: ${window.location.host}`,
              `Also shown on the home page: ${window.location.host}`,
            )}
          </p>
        )}

        <TinyLink row={row} draft={draft} update={update} />

        <hr className="sep" />
        <label className="check">
          <input
            type="checkbox"
            checked={row.status === "open"}
            onChange={(e) => {
              const s = e.target.checked ? "open" : "closed";
              applyNow({ status: s }, () => setFormStatus(row.id, s));
            }}
          />
          {t("הטופס פתוח לתגובות", "Accepting responses")}
        </label>
        {row.is_home ? (
          <p className="small">
            {t("הטופס הזה מוצג בעמוד הבית של האתר.", "This form is shown on the site's home page.")}
          </p>
        ) : (
          <button
            className="btn"
            disabled={!row.published}
            onClick={() => applyNow({ is_home: true }, () => setHomeForm(row.id))}
          >
            {t("הצגת הטופס בעמוד הבית", "Show this form on the home page")}
          </button>
        )}
        {!row.published && (
          <p className="small muted">
            {t(
              "אפשר להציג בעמוד הבית אחרי הפרסום הראשון.",
              "Can be put on the home page after the first publish.",
            )}
          </p>
        )}
      </section>

      <AutoClose draft={draft} update={update} live={row.published} />

      <PreviewLink row={row} setRow={setRow} />

      <section className="card set-card">
        <h3>{t("עמודות ברשימת התגובות", "Columns in the responses list")}</h3>
        <p className="small muted">
          {t(
            "עד 4 שאלות. הראשונה היא הכותרת של כל תגובה.",
            "Up to 4 questions. The first one is each response's title.",
          )}
        </p>
        <ul className="list-fields">
          {fields.map((f) => {
            const on = draft.listFields.includes(f.id);
            const pos = draft.listFields.indexOf(f.id);
            return (
              <li key={f.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && draft.listFields.length >= 4}
                    onChange={(e) =>
                      update((d) => {
                        d.listFields = e.target.checked
                          ? [...d.listFields, f.id]
                          : d.listFields.filter((x) => x !== f.id);
                        return d;
                      })
                    }
                  />
                  {f.label || t("ללא כותרת", "Untitled")}
                  {on && <span className="pill">{pos === 0 ? t("כותרת", "Title") : pos + 1}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card set-card danger-zone">
        <h3>{t("מחיקת הטופס", "Delete form")}</h3>
        {!confirmDel ? (
          <button className="btn danger-ghost" onClick={() => setConfirmDel(true)}>
            {t("מחיקת הטופס וכל התגובות שלו", "Delete this form and all its responses")}
          </button>
        ) : (
          <div className="confirm" role="alert">
            <span>
              {t(
                "בטוחים? הטופס וכל התגובות שלו יימחקו לתמיד.",
                "Sure? The form and all its responses will be deleted for good.",
              )}
            </span>
            <button
              className="btn danger"
              onClick={async () => {
                await deleteForm(row);
                navigate({ to: "/admin" });
              }}
            >
              {t("כן, למחוק", "Yes, delete")}
            </button>
            <button className="btn" onClick={() => setConfirmDel(false)}>
              {t("ביטול", "Cancel")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- auto-close ---------------- */

/** ISO time → value for <input type="datetime-local"> (local time). */
function toLocalInput(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function AutoClose({
  draft,
  update,
  live,
}: {
  draft: FormDef;
  update: (fn: (d: FormDef) => FormDef) => void;
  live: FormDef | null;
}) {
  const t = useT();
  const st = draft.settings ?? {};
  const set = (p: Partial<FormSettings>) =>
    update((d) => {
      const next: FormSettings = { ...d.settings, ...p };
      if (!next.closeAt) delete next.closeAt;
      if (!next.maxResponses) delete next.maxResponses;
      d.settings = next;
      return d;
    });
  const liveSt = live?.settings ?? {};
  const pendingPublish =
    (st.closeAt ?? "") !== (liveSt.closeAt ?? "") ||
    (st.maxResponses ?? 0) !== (liveSt.maxResponses ?? 0);
  const past = st.closeAt && new Date(st.closeAt).getTime() < Date.now();

  return (
    <section className="card set-card">
      <h3>{t("סגירה אוטומטית", "Close automatically")}</h3>
      <p className="small muted">
        {t(
          'הטופס ייסגר לבד בתאריך שתבחרו, או כשיתקבל מספר התגובות שתבחרו (הראשון מביניהם). אחרי זה מי שנכנס רואה את הודעת "הטופס סגור". אפשר להשאיר ריק.',
          'The form closes by itself on the date you pick, or once it gets the number of responses you pick (whichever comes first). Visitors then see the "form closed" message. Leave empty for none.',
        )}
      </p>
      <div className="qe-row">
        <label className="grow">
          <span className="lbl">{t("לסגור בתאריך ושעה", "Close on date & time")}</span>
          <input
            type="datetime-local"
            value={toLocalInput(st.closeAt)}
            onChange={(e) =>
              set({
                closeAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
          />
        </label>
        <label className="grow">
          <span className="lbl">
            {t("לסגור אחרי מספר תגובות", "Close after this many responses")}
          </span>
          <input
            inputMode="numeric"
            value={st.maxResponses || ""}
            placeholder={t("ללא הגבלה", "No limit")}
            onChange={(e) =>
              set({ maxResponses: parseInt(e.target.value.replace(/\D/g, ""), 10) || undefined })
            }
          />
        </label>
      </div>
      {(st.closeAt || st.maxResponses) && (
        <button
          className="link small"
          onClick={() => set({ closeAt: undefined, maxResponses: undefined })}
        >
          {t("ביטול הסגירה האוטומטית", "Remove automatic closing")}
        </button>
      )}
      {past && (
        <p className="msg err small">
          {t(
            "התאריך שבחרתם כבר עבר, אז הטופס ייסגר מיד אחרי הפרסום.",
            "That date has passed, so the form closes as soon as you publish.",
          )}
        </p>
      )}
      {pendingPublish && (
        <p className="msg warn small">
          {t(
            'השינוי הזה ייכנס לתוקף אחרי שתלחצו "פרסום השינויים" למעלה.',
            'This takes effect after you click "Publish changes" at the top.',
          )}
        </p>
      )}
    </section>
  );
}

/* ---------------- secret preview link ---------------- */

function PreviewLink({
  row,
  setRow,
}: {
  row: FormRow;
  setRow: React.Dispatch<React.SetStateAction<FormRow | null | undefined>>;
}) {
  const t = useT();
  const v3 = useUpdate3();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const url = row.preview_token
    ? `${window.location.origin}/preview/${row.slug}?t=${row.preview_token}`
    : "";
  const toggle = async (on: boolean) => {
    setBusy(true);
    setErr("");
    try {
      const token = await setPreviewToken(row.id, on);
      setRow((r) => (r ? { ...r, preview_token: token } : r));
    } catch (e) {
      console.error(e);
      setErr(t("זה לא הצליח. נסו שוב.", "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card set-card">
      <h3>{t("קישור לתצוגה מקדימה (לפני פרסום)", "Preview link (before publishing)")}</h3>
      <p className="small muted">
        {t(
          "קישור סודי שמראה את הטיוטה, כולל שינויים שעוד לא פורסמו, כדי שמישהו אחר יוכל לבדוק לפני שזה עולה לאוויר. מי שפותח אותו לא יכול לשלוח תשובות. אפשר לבטל את הקישור בכל רגע.",
          "A secret link that shows the draft, including unpublished changes, so someone else can check it before it goes live. Nobody can submit answers through it. You can switch it off any time.",
        )}
      </p>
      {v3 === false ? (
        <NeedsUpdate />
      ) : url ? (
        <>
          <div className="preview-url" dir="ltr">
            {url}
          </div>
          <div className="set-actions">
            <CopyLink url={url} />
            <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
              {t("פתיחה", "Open")}
            </a>
            <button className="btn danger-ghost" disabled={busy} onClick={() => toggle(false)}>
              {t("ביטול הקישור", "Switch link off")}
            </button>
          </div>
          <p className="small muted">
            {t(
              "שינוי של שם הקישור של הטופס משנה גם את הקישור הזה.",
              "Changing the form's link name changes this link too.",
            )}
          </p>
        </>
      ) : (
        <button className="btn" disabled={busy || v3 === null} onClick={() => toggle(true)}>
          {t("יצירת קישור לתצוגה מקדימה", "Create a preview link")}
        </button>
      )}
      {err && <p className="msg err small">{err}</p>}
    </section>
  );
}

/* ---------------- version history ---------------- */

function VersionsTab({ row, onRestore }: { row: FormRow; onRestore: (v: FormVersion) => void }) {
  const t = useT();
  const v3 = useUpdate3();
  const history = row.history ?? [];
  const qCount = (d: FormDef) => allFields(d).length;
  return (
    <div className="card versions">
      <h3>{t("גרסאות קודמות", "Version history")}</h3>
      <p className="small muted">
        {t(
          'בכל פעם שלוחצים "פרסום", הגרסה שהייתה באוויר עד אז נשמרת כאן (20 האחרונות). "שחזור" טוען גרסה ישנה לטיוטה, ואז בודקים ולוחצים "פרסום". התגובות שכבר התקבלו לא משתנות.',
          'Every time you click "Publish", the version that was live until then is kept here (last 20). "Restore" loads an old version into the draft; then check it and click "Publish". Responses already received are not affected.',
        )}
      </p>
      {v3 === false && <NeedsUpdate />}
      <ul className="ver-list">
        {row.published && (
          <li className="ver now">
            <div>
              <b>{t("באוויר עכשיו", "Live now")}</b>
              <span className="small muted">
                {row.published_at ? fmtDate(row.published_at) : ""} ·{" "}
                {t(`${qCount(row.published)} שאלות`, `${qCount(row.published)} questions`)}
              </span>
            </div>
            <button
              className="btn"
              onClick={() => onRestore({ at: row.published_at ?? "", def: row.published! })}
            >
              {t("טעינה לטיוטה", "Load into draft")}
            </button>
          </li>
        )}
        {history.map((v, i) => (
          <li className="ver" key={`${v.at}-${i}`}>
            <div>
              <b>{fmtDate(v.at)}</b>
              <span className="small muted">
                {v.def.texts.title || ""} ·{" "}
                {t(`${qCount(v.def)} שאלות`, `${qCount(v.def)} questions`)}
              </span>
            </div>
            <button className="btn" onClick={() => onRestore(v)}>
              {t("שחזור", "Restore")}
            </button>
          </li>
        ))}
      </ul>
      {!row.published && (
        <p className="small muted">
          {t("הטופס עוד לא פורסם, אין גרסאות.", "Not published yet, no versions.")}
        </p>
      )}
      {row.published && !history.length && v3 !== false && (
        <p className="small muted">
          {t(
            "עוד אין גרסאות קודמות. הן יופיעו כאן אחרי הפרסום הבא.",
            "No earlier versions yet. They'll show up here after the next publish.",
          )}
        </p>
      )}
    </div>
  );
}

/* ---------------- tiny link (is.gd) ---------------- */

function TinyLink({
  row,
  draft,
  update,
}: {
  row: FormRow;
  draft: FormDef;
  update: (fn: (d: FormDef) => FormDef) => void;
}) {
  const t = useT();
  const [alias, setAlias] = useState(() => draft.share?.alias ?? suggestAlias(row.slug));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const target = formLink(row.slug);
  const share = draft.share;
  const stale = !!share && share.target !== target;

  // When the form's link name changes, offer a fresh name and drop the old message.
  const firstSlug = useRef(row.slug);
  useEffect(() => {
    if (row.slug === firstSlug.current) return;
    firstSlug.current = row.slug;
    setMsg(null);
    setAlias(suggestAlias(row.slug));
  }, [row.slug]);

  const create = async () => {
    const a = alias.trim();
    if (!ALIAS_RE.test(a)) {
      setMsg({
        kind: "err",
        text: t(
          "שם לקישור הקצר: 5–30 תווים, אותיות באנגלית, מספרים או קו תחתון (_), בלי רווחים ומקפים.",
          "Tiny link name: 5–30 characters, English letters, numbers or underscore (_), no spaces or dashes.",
        ),
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await createTinyLink({ data: { url: target, alias: a } });
      if (res.ok) {
        const next = {
          shortUrl: res.shortUrl,
          alias: a,
          target,
          createdAt: new Date().toISOString(),
        };
        update((d) => ({ ...d, share: next }));
        void rememberTinyLink(next); // also into the shared list on the admin home
        setMsg({ kind: "ok", text: t("הקישור הקצר מוכן ✓", "Tiny link ready ✓") });
      } else {
        const text = {
          taken: t(
            "השם הזה כבר תפוס ב-is.gd. נסו שם אחר, למשל עם השנה בסוף.",
            "That name is taken on is.gd. Try another, e.g. add the year.",
          ),
          invalid: t(
            "is.gd לא קיבל את השם או הכתובת. נסו שם אחר.",
            "is.gd didn't accept the name or address. Try another name.",
          ),
          busy: t(
            "is.gd עמוס כרגע. נסו שוב בעוד דקה.",
            "is.gd is busy right now. Try again in a minute.",
          ),
          unavailable: t(
            "לא הצלחנו להגיע ל-is.gd. נסו שוב בעוד רגע.",
            "Couldn't reach is.gd. Try again in a moment.",
          ),
          forbidden: t(
            "רק מנהלים יכולים ליצור קישורים קצרים.",
            "Only admins can create tiny links.",
          ),
        }[res.reason];
        setMsg({ kind: "err", text });
      }
    } catch (e) {
      console.error(e);
      setMsg({
        kind: "err",
        text: t("יצירת הקישור נכשלה. נסו שוב.", "Creating the link failed. Try again."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tiny">
      <span className="lbl">{t("קישור קצר עם שם משלכם", "Tiny link with your own name")}</span>
      {share && (
        <div className={`tiny-current${stale ? " stale" : ""}`}>
          <a
            href={share.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="tiny-url"
          >
            {share.shortUrl.replace(/^https?:\/\//, "")}
          </a>
          <CopyLink url={share.shortUrl} label={t("העתקה", "Copy")} />
          <a
            className="btn"
            href={`https://is.gd/stats.php?url=${encodeURIComponent(share.alias)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("כמה לחצו", "Clicks")}
          </a>
          {stale && (
            <p className="small">
              {t(
                "הקישור הקצר הזה מפנה לכתובת הקודמת של הטופס. צרו חדש עם שם אחר.",
                "This tiny link points to the form's previous address. Make a new one with another name.",
              )}
            </p>
          )}
        </div>
      )}
      <div className="tiny-make">
        <div className="slug-row">
          <span className="slug-base" dir="ltr">
            is.gd/
          </span>
          <input
            dir="ltr"
            aria-label={t("שם לקישור הקצר", "Tiny link name")}
            value={alias}
            onChange={(e) =>
              setAlias(e.target.value.replace(/[\s-]+/g, "_").replace(/[^A-Za-z0-9_]/g, ""))
            }
            placeholder="singles2027"
          />
        </div>
        <button className="btn primary" disabled={busy} onClick={create}>
          {busy
            ? t("יוצר…", "Creating…")
            : share
              ? t("יצירת קישור קצר חדש", "Make a new tiny link")
              : t("יצירת קישור קצר", "Make tiny link")}
        </button>
      </div>
      {msg && (
        <p className={`msg ${msg.kind}`} role="status">
          {msg.text}
        </p>
      )}
      <p className="small muted">
        {t(
          "נוצר בחינם דרך is.gd, בלי חשבון. קישור קצר הוא קבוע ולא ניתן לשינוי או מחיקה, לכן כדאי לבחור את שם הקישור באתר לפני שיוצרים אותו.",
          "Made for free with is.gd, no account. A tiny link is permanent and can't be edited or deleted, so settle the site link name first.",
        )}
        {!row.published &&
          t(" הקישור יעבוד אחרי שהטופס יפורסם.", " The link will work once the form is published.")}
      </p>
    </div>
  );
}
