import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { hasUpdate3 } from "@/forms/api";
import { supabase } from "@/integrations/supabase/client";
import { telHref, waNumber } from "@/lib/admin-data";

export type Lang = "he" | "en";
export const LANG_KEY = "s27-admin-lang";
let LANG: Lang = "he";
export const currentLang = () => LANG;
export const setCurrentLang = (l: Lang) => {
  LANG = l;
};
export const LangCtx = createContext<Lang>("he");
/** Pick the Hebrew or English string for the current admin language. */
export function useT() {
  const lang = useContext(LangCtx);
  return (he: string, en: string) => (lang === "en" ? en : he);
}
export const loc = () => (LANG === "en" ? "en-GB" : "he-IL");

export const REFRESH_MS = 30_000;
export const SEEN_KEY = "s27-admin-seen";

export const fmtN = (x: number | null | undefined) =>
  x == null ? "—" : Number(x).toLocaleString(loc());
export const fmtDate = (s: string) =>
  new Date(s).toLocaleString(loc(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function readSeen(key: string = SEEN_KEY): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
export function writeSeen(s: Set<string>, key: string = SEEN_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* storage unavailable: "new" badges just won't persist */
  }
}

export function timeAgo(d: Date | null, now: number) {
  if (!d) return "";
  const en = LANG === "en";
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 10) return en ? "just now" : "עכשיו";
  if (s < 60) return en ? `${s} seconds ago` : `לפני ${s} שניות`;
  const m = Math.round(s / 60);
  if (en) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  return m === 1 ? "לפני דקה" : `לפני ${m} דקות`;
}

/* ---------------- page + auth ---------------- */

export type Status = "loading" | "out" | "denied" | "admin" | "recovery";

export function AdminShell({ children }: { children: (email: string) => ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState("");
  const [lang, setLang] = useState<Lang>("he");
  setCurrentLang(lang);
  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === "en") setLang("en");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleLang = () => {
    const next: Lang = lang === "he" ? "en" : "he";
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const t = (he: string, en: string) => (lang === "en" ? en : he);

  const check = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setStatus("out");
    setEmail(data.user.email ?? "");
    const { data: ok } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
    setStatus(ok ? "admin" : "denied");
  }, []);

  useEffect(() => {
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "PASSWORD_RECOVERY") setStatus("recovery");
      else if (e === "SIGNED_IN" || e === "SIGNED_OUT") check();
    });
    return () => sub.subscription.unsubscribe();
  }, [check]);

  return (
    <LangCtx.Provider value={lang}>
      <div className="s27a" dir={lang === "en" ? "ltr" : "rtl"} lang={lang}>
        <button
          className="btn lang-toggle"
          onClick={toggleLang}
          aria-label={t("Switch to English", "החלפה לעברית")}
        >
          {lang === "he" ? "English" : "עברית"}
        </button>
        {status === "loading" && <p className="center muted">{t("טוען…", "Loading…")}</p>}
        {status === "out" && <Login />}
        {status === "recovery" && <SetPassword onDone={check} />}
        {status === "denied" && (
          <div className="card auth">
            <h1>{t("אין הרשאת ניהול", "No admin access")}</h1>
            <p className="muted">
              {t("מחוברים כ-", "Signed in as ")}
              <b dir="ltr">{email}</b>
              {t(
                ", אבל לחשבון הזה אין הרשאת מנהל. בקשו ממנהל המערכת להוסיף לכם הרשאה.",
                ", but this account isn't an admin. Ask an administrator to grant access.",
              )}
            </p>
            <button className="btn" onClick={() => supabase.auth.signOut()}>
              {t("התנתקות", "Sign out")}
            </button>
          </div>
        )}
        {status === "admin" && children(email)}
      </div>
    </LangCtx.Provider>
  );
}

export function Login() {
  const [mode, setMode] = useState<"pin" | "email">("pin");
  return mode === "pin" ? (
    <PinLogin onEmail={() => setMode("email")} />
  ) : (
    <EmailLogin onPin={() => setMode("pin")} />
  );
}

function PinLogin({ onEmail }: { onEmail: () => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const { pinLogin } = await import("@/forms/pin");
      const res = await pinLogin({ data: { code } });
      if (res.ok) {
        const { error } = await supabase.auth.setSession({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        });
        if (error) throw error;
        return; // the shell notices the new session and opens the dashboard
      }
      setCode("");
      setMsg(
        res.reason === "wrong"
          ? t("הקוד לא נכון. נסו שוב.", "Wrong code. Try again.")
          : res.reason === "locked"
            ? t(
                `יותר מדי ניסיונות. נסו שוב בעוד ${Math.ceil((res.retryInSec ?? 600) / 60)} דקות.`,
                `Too many tries. Try again in ${Math.ceil((res.retryInSec ?? 600) / 60)} minutes.`,
              )
            : res.reason === "setup"
              ? t(
                  "הכניסה עם קוד עוד לא הוגדרה. פנו למי שבנה את האתר.",
                  "Code entry isn't set up yet. Contact whoever built the site.",
                )
              : t("משהו השתבש. נסו שוב בעוד רגע.", "Something went wrong. Try again in a moment."),
      );
    } catch (err) {
      console.error(err);
      setMsg(t("משהו השתבש. נסו שוב בעוד רגע.", "Something went wrong. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card auth pin" onSubmit={submit}>
      <span className="pin-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.5 1.2 4.3 2.4.8-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
        </svg>
      </span>
      <p className="eyebrow">
        {t("אירוע ההכרויות הגדול של ישראל 2027", "Israel's Big Singles Event 2027")}
      </p>
      <h1>{t("ניהול הטפסים", "Forms admin")}</h1>
      <label htmlFor="adm-pin">{t("קוד כניסה", "Entry code")}</label>
      <input
        id="adm-pin"
        className="pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        maxLength={32}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
        autoFocus
        aria-describedby={msg ? "pin-msg" : undefined}
      />
      {msg && (
        <p className="msg err" id="pin-msg" role="alert">
          {msg}
        </p>
      )}
      <button className="btn primary" disabled={busy || !code}>
        {busy ? t("בודק…", "Checking…") : t("כניסה", "Enter")}
      </button>
      <button type="button" className="link subtle" onClick={onEmail}>
        {t("כניסה עם מייל וסיסמה", "Sign in with email and password")}
      </button>
    </form>
  );
}

function EmailLogin({ onPin }: { onPin: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error)
      setMsg({
        kind: "err",
        text: t("המייל או הסיסמה לא נכונים. נסו שוב.", "Wrong email or password. Try again."),
      });
  };

  const forgot = async () => {
    if (!email.trim())
      return setMsg({
        kind: "err",
        text: t(
          "כתבו קודם את המייל שלכם, ואז לחצו שוב על ״שכחתי סיסמה״.",
          "Type your email first, then click “Forgot password” again.",
        ),
      });
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin`,
    });
    setBusy(false);
    setMsg(
      error
        ? {
            kind: "err",
            text: t(
              "לא הצלחנו לשלוח מייל איפוס. נסו שוב בעוד דקה.",
              "Couldn't send the reset email. Try again in a minute.",
            ),
          }
        : {
            kind: "ok",
            text: t(
              "אם המייל רשום כמנהל, נשלח אליו קישור לבחירת סיסמה חדשה.",
              "If this email is an admin, a link to set a new password was sent.",
            ),
          },
    );
  };

  return (
    <form className="card auth" onSubmit={submit}>
      <p className="eyebrow">
        {t("אירוע ההכרויות הגדול של ישראל 2027", "Israel's Big Singles Event 2027")}
      </p>
      <h1>{t("כניסת מנהלים", "Admin sign in")}</h1>
      <label htmlFor="adm-email">{t("מייל", "Email")}</label>
      <input
        id="adm-email"
        type="email"
        dir="ltr"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <label htmlFor="adm-pass">{t("סיסמה", "Password")}</label>
      <input
        id="adm-pass"
        type="password"
        dir="ltr"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {msg && (
        <p className={msg.kind === "err" ? "msg err" : "msg ok"} role="status">
          {msg.text}
        </p>
      )}
      <button className="btn primary" disabled={busy}>
        {busy ? t("רגע…", "One moment…") : t("כניסה", "Sign in")}
      </button>
      <button type="button" className="link" onClick={forgot} disabled={busy}>
        {t("שכחתי סיסמה", "Forgot password")}
      </button>
      <button type="button" className="link subtle" onClick={onPin}>
        {t("כניסה עם קוד", "Enter with a code")}
      </button>
    </form>
  );
}

export function SetPassword({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8)
      return setErr(
        t("הסיסמה צריכה להיות לפחות 8 תווים.", "Password must be at least 8 characters."),
      );
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error)
      return setErr(
        t(
          "לא הצלחנו לשמור את הסיסמה. בקשו קישור איפוס חדש.",
          "Couldn't save the password. Request a new reset link.",
        ),
      );
    onDone();
  };
  return (
    <form className="card auth" onSubmit={submit}>
      <h1>{t("בחירת סיסמה חדשה", "Choose a new password")}</h1>
      <label htmlFor="adm-new">
        {t("סיסמה חדשה (לפחות 8 תווים)", "New password (at least 8 characters)")}
      </label>
      <input
        id="adm-new"
        type="password"
        dir="ltr"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        required
      />
      {err && <p className="msg err">{err}</p>}
      <button className="btn primary">{t("שמירה וכניסה", "Save and sign in")}</button>
    </form>
  );
}

/* ---------------- dashboard ---------------- */

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`stat${accent ? " accent" : ""}`}>
      <span className="v">{value}</span>
      <span className="l">{label}</span>
    </div>
  );
}

export function useSignedUrl(path: string | null, download?: string) {
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

export function Field({ k, v, ltr }: { k: string; v: ReactNode; ltr?: boolean }) {
  const empty = v == null || v === "" || v === "—";
  return (
    <div className="kv">
      <dt>{k}</dt>
      <dd dir={ltr ? "ltr" : undefined} className={empty ? "muted" : undefined}>
        {empty ? "—" : v}
      </dd>
    </div>
  );
}

export function Contact({ phone, email }: { phone: string; email: string }) {
  const t = useT();
  const wa = waNumber(phone);
  return (
    <div className="actions">
      {phone && (
        <a className="btn" href={telHref(phone)}>
          {t("התקשרות", "Call")}
        </a>
      )}
      {wa && (
        <a
          className="btn wa"
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      )}
      {email && (
        <a className="btn" href={`mailto:${email}`}>
          {t("מייל", "Email")}
        </a>
      )}
    </div>
  );
}

export function Tags({ items }: { items: string[] }) {
  return (
    <span className="tags">
      {items.map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
    </span>
  );
}

/* ---------------- database update part 3 ---------------- */

/** null while checking; then whether "database update part 3" is installed. */
export function useUpdate3() {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    hasUpdate3()
      .then((x) => live && setV(x))
      .catch(() => live && setV(false));
    return () => {
      live = false;
    };
  }, []);
  return v;
}

/** Shown in place of a feature that needs the small database update. */
export function NeedsUpdate({ what }: { what?: string }) {
  const t = useT();
  return (
    <p className="needs-update small" role="note">
      {what ? <b>{what}: </b> : null}
      {t(
        "האפשרות הזאת תופעל אחרי עדכון קטן למסד הנתונים (חלק 3). כל השאר עובד כרגיל.",
        "This turns on after a small database update (part 3). Everything else works as usual.",
      )}
    </p>
  );
}
