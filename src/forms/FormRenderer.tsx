import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import { answersSummary, isPeople, isStrList, toNumber } from "./answers";
import { Backdrop, Hero, Intro } from "./Heroes";
import { templateOf } from "./templates";
import type {
  AnswerValue,
  Answers,
  Field,
  FormDef,
  PersonAnswer,
  Section,
  TemplateId,
} from "./types";
import { allFields } from "./types";

export type SubmitResult = { ok: true } | { ok: false; error?: string; fallbackText?: string };

type Props = {
  def: FormDef;
  template: TemplateId;
  accent?: string | null;
  /**
   * live: real submissions. preview: editor preview (no saving). closed: form not accepting answers.
   * admin: the admin edits or adds a sign-up (plain form, nothing required, no consent box).
   */
  mode: "live" | "preview" | "closed" | "admin";
  onSubmit?: (answers: Answers, files: Record<string, File[]>) => Promise<SubmitResult>;
  /** admin mode: answers to start from (editing an existing sign-up) */
  initial?: Answers | undefined;
  /** admin mode: names of files already saved, per question */
  existingFiles?: Record<string, string[]> | undefined;
  /** admin mode: text of the save button */
  submitLabel?: string | undefined;
  onCancel?: (() => void) | undefined;
};

const MAX_FILE = 10 * 1024 * 1024;
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
function limitWords(value: string, max: number) {
  if (!max || countWords(value) <= max) return value;
  const m = value.match(new RegExp(`^\\s*(\\S+\\s+){${max - 1}}\\S+`));
  return m ? m[0] : value;
}

const emptyPerson = (): PersonAnswer => ({ name: "", phone: "", email: "" });

function initialAnswers(def: FormDef, start?: Answers): Answers {
  const a: Answers = {};
  for (const f of allFields(def)) {
    const v = start?.[f.id];
    if (f.type === "multi") a[f.id] = isStrList(v ?? null) ? (v as string[]) : [];
    else if (f.type === "people")
      a[f.id] = isPeople(v ?? null) && (v as PersonAnswer[]).length ? v! : [emptyPerson()];
    else if (f.type === "number") a[f.id] = typeof v === "number" ? v : null;
    else if (f.type !== "file") a[f.id] = typeof v === "string" ? v : v == null ? "" : String(v);
  }
  return a;
}

function isEmpty(f: Field, v: AnswerValue | undefined, files: File[] | undefined) {
  if (f.type === "file") return !files?.length;
  if (f.type === "people")
    return !isPeople(v ?? null) || !(v as PersonAnswer[]).some((p) => p.name.trim());
  if (f.type === "multi") return !isStrList(v ?? null) || !(v as string[]).length;
  if (f.type === "number") return typeof v !== "number";
  return !String(v ?? "").trim();
}

/** Clean answers before saving: trim text, drop empty people rows. */
function cleanAnswers(def: FormDef, a: Answers): Answers {
  const out: Answers = {};
  for (const f of allFields(def)) {
    if (f.type === "file") continue;
    const v = a[f.id];
    if (f.type === "people" && isPeople(v ?? null)) {
      out[f.id] = (v as PersonAnswer[])
        .map((p) => ({ name: p.name.trim(), phone: p.phone.trim(), email: p.email.trim() }))
        .filter((p) => p.name || p.phone || p.email);
    } else if (typeof v === "string") out[f.id] = v.trim();
    else out[f.id] = v ?? null;
  }
  return out;
}

/* ---------- small controls ---------- */

function FileDrop({
  id,
  hint,
  file,
  invalid,
  onFile,
  onTooBig,
}: {
  id: string;
  hint?: string | undefined;
  file: File | null;
  invalid: boolean;
  onFile: (f: File) => void;
  onTooBig: () => void;
}) {
  const [over, setOver] = useState(false);
  const preview = useMemo(
    () => (file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const take = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return onTooBig();
    onFile(f);
  };
  return (
    <div
      className={`drop${over ? " over" : ""}${invalid ? " invalid" : ""}`}
      onDragEnter={(e) => (e.preventDefault(), setOver(true))}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={(e) => (e.preventDefault(), setOver(false))}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
    >
      <input id={id} type="file" onChange={(e) => take(e.target.files?.[0])} />
      {file ? (
        <>
          {preview ? (
            <img src={preview} alt="" />
          ) : (
            <span className="ic" aria-hidden="true">
              ✓
            </span>
          )}
          <span className="name">{file.name} · לחצו להחלפה</span>
        </>
      ) : (
        <>
          <span className="ic" aria-hidden="true">
            ↑
          </span>
          <span className="txt">
            לחצו או גררו לכאן
            {hint ? (
              <>
                <br />
                {hint}
              </>
            ) : null}
          </span>
        </>
      )}
    </div>
  );
}

function Chips({
  name,
  options,
  multi,
  value,
  onChange,
}: {
  name: string;
  options: string[];
  multi: boolean;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="chips">
      {options.map((opt, i) => {
        const id = `${name}-${i}`;
        const on = value.includes(opt);
        return (
          <label key={id} className="chip" htmlFor={id}>
            <input
              type={multi ? "checkbox" : "radio"}
              id={id}
              name={name}
              value={opt}
              checked={on}
              onChange={(e) =>
                onChange(
                  multi
                    ? e.target.checked
                      ? [...value, opt]
                      : value.filter((v) => v !== opt)
                    : [opt],
                )
              }
            />
            <span>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ---------- renderer ---------- */

export function FormRenderer({
  def,
  template,
  accent,
  mode,
  onSubmit,
  initial,
  existingFiles,
  submitLabel,
  onCancel,
}: Props) {
  const admin = mode === "admin";
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(def, initial));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { fallbackText?: string }>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const t = def.texts;
  const tpl = templateOf(template);

  // Keep answers in step when the editor adds or removes questions.
  useEffect(() => {
    setAnswers((prev) => {
      const base = initialAnswers(def);
      for (const k of Object.keys(base)) if (k in prev) base[k] = prev[k]!;
      return base;
    });
  }, [def]);

  const style = { "--accent": accent || tpl.accent } as CSSProperties;

  const set = (id: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [id]: v }));

  function validate() {
    const bad: string[] = [];
    for (const f of allFields(def)) {
      const v = answers[f.id];
      if (f.required && !admin && isEmpty(f, v, files[f.id])) bad.push(f.id);
      else if (
        f.type === "email" &&
        typeof v === "string" &&
        v.trim() &&
        !/^\S+@\S+\.\S+$/.test(v.trim())
      )
        bad.push(f.id);
      else if (
        f.type === "phone" &&
        typeof v === "string" &&
        v.trim() &&
        v.replace(/\D/g, "").length < 9
      )
        bad.push(f.id);
    }
    if (t.consent && !consent && !admin) bad.push("__consent");
    setInvalid(new Set(bad));
    if (bad.length) {
      setError(`חסרים או שגויים ${bad.length} שדות. סימנו אותם באדום, תקנו ושלחו שוב.`);
      const first = formRef.current?.querySelector<HTMLElement>(
        `[data-q="${bad[0]}"] input, [data-q="${bad[0]}"] textarea, [data-q="${bad[0]}"] select`,
      );
      first?.focus();
      return false;
    }
    setError("");
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (honeypot) return;
    if (!validate()) return;
    if (mode === "preview") {
      setError("");
      setDone({});
      return;
    }
    if (!onSubmit) return;
    setBusy(true);
    const res = await onSubmit(cleanAnswers(def, answers), files).catch((): SubmitResult => ({
      ok: false,
      error: "השליחה נכשלה. בדקו את החיבור ונסו שוב.",
    }));
    setBusy(false);
    if (res.ok) setDone({});
    else if (res.fallbackText) setDone({ fallbackText: res.fallbackText });
    else setError(res.error || "השליחה נכשלה. בדקו את החיבור ונסו שוב.");
  }

  const fieldCls = (f: Field) => `f${f.width === "half" ? "" : " full"}`;
  const err = (id: string) => (invalid.has(id) ? "invalid" : undefined);

  function control(f: Field): ReactNode {
    const v = answers[f.id];
    const str = typeof v === "string" ? v : "";
    const id = `q-${f.id}`;
    switch (f.type) {
      case "long": {
        const words = countWords(str);
        return (
          <>
            <textarea
              id={id}
              className={err(f.id)}
              value={str}
              placeholder={f.placeholder}
              onChange={(e) => set(f.id, limitWords(e.target.value, f.maxWords || 0))}
            />
            {f.maxWords ? (
              <span className={`wc${words >= f.maxWords ? " max" : ""}`} aria-live="polite">
                {words} / {f.maxWords} מילים{words >= f.maxWords ? " · הגעתם למקסימום" : ""}
              </span>
            ) : null}
          </>
        );
      }
      case "number": {
        const input = (
          <input
            id={id}
            inputMode="decimal"
            className={err(f.id)}
            placeholder={f.placeholder}
            defaultValue={typeof v === "number" ? String(v) : ""}
            onChange={(e) => set(f.id, toNumber(e.target.value))}
          />
        );
        return f.percent ? (
          <div className="suffix">
            {input}
            <span>%</span>
          </div>
        ) : (
          input
        );
      }
      case "phone":
        return (
          <input
            id={id}
            type="tel"
            autoComplete="tel"
            className={err(f.id)}
            placeholder={f.placeholder}
            value={str}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
      case "email":
        return (
          <input
            id={id}
            type="email"
            autoComplete="email"
            className={err(f.id)}
            placeholder={f.placeholder}
            value={str}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
      case "date":
        return (
          <input
            id={id}
            type="date"
            className={err(f.id)}
            value={str}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
      case "dropdown":
        return (
          <select
            id={id}
            className={err(f.id)}
            value={str}
            onChange={(e) => set(f.id, e.target.value)}
          >
            <option value="">{f.placeholder || "בחרו…"}</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case "single":
      case "yesno":
        return (
          <Chips
            name={id}
            multi={false}
            options={f.type === "yesno" ? ["כן", "לא"] : (f.options ?? [])}
            value={str ? [str] : []}
            onChange={(x) => set(f.id, x[0] ?? "")}
          />
        );
      case "multi":
        return (
          <Chips
            name={id}
            multi
            options={f.options ?? []}
            value={isStrList(v ?? null) ? (v as string[]) : []}
            onChange={(x) => set(f.id, x)}
          />
        );
      case "file":
        return (
          <>
            {admin && existingFiles?.[f.id]?.length && !files[f.id]?.length ? (
              <span className="hint">
                שמור כבר: {existingFiles[f.id]!.map((p) => p.split("/").pop()).join(", ")} · קובץ
                חדש יחליף אותו
              </span>
            ) : null}
            <FileDrop
              id={id}
              hint={f.help}
              file={files[f.id]?.[0] ?? null}
              invalid={invalid.has(f.id)}
              onFile={(file) => setFiles((x) => ({ ...x, [f.id]: [file] }))}
              onTooBig={() => setError("הקובץ גדול מ-10MB. נסו קובץ קטן יותר.")}
            />
          </>
        );
      case "people": {
        const people =
          isPeople(v ?? null) && (v as PersonAnswer[]).length
            ? (v as PersonAnswer[])
            : [emptyPerson()];
        const upd = (i: number, k: keyof PersonAnswer, val: string) =>
          set(
            f.id,
            people.map((p, j) => (j === i ? { ...p, [k]: val } : p)),
          );
        return (
          <>
            <div className={`partners${invalid.has(f.id) ? " invalid-box" : ""}`}>
              {people.map((p, i) => (
                <div className="partner" key={i}>
                  <input
                    className="pn"
                    placeholder="שם מלא"
                    aria-label="שם מלא"
                    value={p.name}
                    onChange={(e) => upd(i, "name", e.target.value)}
                  />
                  <input
                    className="pp ph"
                    type="tel"
                    placeholder="טלפון נייד"
                    aria-label="טלפון נייד"
                    value={p.phone}
                    onChange={(e) => upd(i, "phone", e.target.value)}
                  />
                  <input
                    className="pe ph"
                    type="email"
                    placeholder="מייל"
                    aria-label="מייל"
                    value={p.email}
                    onChange={(e) => upd(i, "email", e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="הסרה"
                    onClick={() => {
                      const rest = people.filter((_, j) => j !== i);
                      set(f.id, rest.length ? rest : [emptyPerson()]);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="add"
              onClick={() => set(f.id, [...people, emptyPerson()])}
            >
              + הוספת איש/אשת קשר
            </button>
          </>
        );
      }
      default:
        return (
          <input
            id={id}
            className={err(f.id)}
            placeholder={f.placeholder}
            value={str}
            onChange={(e) => set(f.id, e.target.value)}
          />
        );
    }
  }

  function renderField(f: Field) {
    const grouped =
      f.type === "single" || f.type === "multi" || f.type === "yesno" || f.type === "people";
    const req = f.required ? <span className="req"> *</span> : null;
    const showHelp = f.help && f.type !== "file";
    return (
      <div
        className={fieldCls(f)}
        key={f.id}
        data-q={f.id}
        role={grouped ? "group" : undefined}
        aria-labelledby={grouped ? `l-${f.id}` : undefined}
      >
        {f.label ? (
          grouped ? (
            <span className="glabel" id={`l-${f.id}`}>
              {f.label}
              {req}
            </span>
          ) : (
            <label htmlFor={`q-${f.id}`}>
              {f.label}
              {req}
            </label>
          )
        ) : null}
        {showHelp && <span className="hint">{f.help}</span>}
        {control(f)}
      </div>
    );
  }

  function sectionSum(s: Section) {
    const sumFields = s.fields.filter((f) => f.type === "number" && f.sum);
    if (!sumFields.length) return null;
    const total = sumFields.reduce(
      (n, f) => n + (typeof answers[f.id] === "number" ? (answers[f.id] as number) : 0),
      0,
    );
    return (
      <div className="reach">
        <span>{s.sumLabel || "סך הכל"}</span>
        <output>{total.toLocaleString("he-IL")}</output>
      </div>
    );
  }

  const doneBtn = def.settings?.doneButton;
  const body = (() => {
    if (mode === "closed") {
      return (
        <div className="done">
          <div className="big">{t.closedTitle || "הטופס סגור"}</div>
          {t.closedText && <p>{t.closedText}</p>}
        </div>
      );
    }
    if (done) {
      if (done.fallbackText) return <Fallback text={done.fallbackText} />;
      return (
        <div className="done">
          <div className="big">{t.doneTitle || "תודה!"}</div>
          {t.doneText && <p>{t.doneText}</p>}
          {doneBtn?.label && doneBtn.url ? (
            <a
              className="btn done-link"
              href={
                /^(https?:|mailto:|tel:|\/)/i.test(doneBtn.url)
                  ? doneBtn.url
                  : `https://${doneBtn.url}`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {doneBtn.label}
            </a>
          ) : null}
          {mode === "preview" && (
            <button className="btn" type="button" onClick={() => setDone(null)}>
              חזרה לטופס (תצוגה מקדימה)
            </button>
          )}
        </div>
      );
    }
    return (
      <form ref={formRef} noValidate onSubmit={submit}>
        {def.sections.map((s, i) => (
          <fieldset key={s.id}>
            <legend className="sr-only">{s.title}</legend>
            <div className="lg" aria-hidden="true">
              <span className="n">{i + 1}</span>
              <span className="t">{s.title}</span>
              {s.subtitle && <span className="s">{s.subtitle}</span>}
            </div>
            <div className="row">{s.fields.map(renderField)}</div>
            {sectionSum(s)}
          </fieldset>
        ))}
        <input
          className="hp"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
        {t.consent && !admin && (
          <label className="consent" htmlFor="q-consent">
            <input
              id="q-consent"
              type="checkbox"
              className={err("__consent")}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t.consent}
          </label>
        )}
        {error && (
          <div className="msg err" role="alert">
            {error}
          </div>
        )}
        <div className={admin ? "admin-actions" : undefined}>
          <button className="submit" type="submit" disabled={busy}>
            {busy ? "שומרים…" : admin ? submitLabel || "שמירה" : t.submit || "שליחה"}
          </button>
          {admin && onCancel && (
            <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
              ביטול
            </button>
          )}
        </div>
        {mode === "preview" && <p className="preview-note">תצוגה מקדימה: שום דבר לא נשמר</p>}
      </form>
    );
  })();

  if (admin) {
    return (
      <div className={`s27f tpl-${template} admin-form`} style={style} dir="rtl" lang="he">
        {body}
      </div>
    );
  }

  return (
    <div className={`s27f tpl-${template}`} style={style} dir="rtl" lang="he">
      <Backdrop template={template} />
      <div className="wrap">
        <Hero template={template} t={t} />
        {mode !== "closed" && !done && <Intro template={template} t={t} />}
        {body}
        {t.footer && <footer>{t.footer}</footer>}
      </div>
    </div>
  );
}

function Fallback({ text }: { text: string }) {
  const pre = useRef<HTMLPreElement>(null);
  const [label, setLabel] = useState("העתקת הפרטים");
  const select = () => {
    if (!pre.current) return;
    const r = document.createRange();
    r.selectNodeContents(pre.current);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    setLabel("מסומן – העתיקו עם Ctrl+C");
  };
  return (
    <div className="done">
      <div className="big">כמעט שם</div>
      <p>כדי שהבקשה תגיע לצוות, שלחו אותה בוואטסאפ או העתיקו אותה, וצרפו את הקבצים להודעה.</p>
      <div className="btns">
        <a
          className="btn wa"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        >
          שליחה בוואטסאפ
        </a>
        <button
          className="btn"
          type="button"
          onClick={() => {
            try {
              navigator.clipboard.writeText(text).then(() => setLabel("הועתק ✓"), select);
            } catch {
              select();
            }
          }}
        >
          {label}
        </button>
      </div>
      <pre className="summary" ref={pre}>
        {text}
      </pre>
    </div>
  );
}

export { answersSummary };
