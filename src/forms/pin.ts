import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type PinResult =
  | { ok: true; access_token: string; refresh_token: string }
  | { ok: false; reason: "wrong" | "locked" | "setup" | "error"; retryInSec?: number };

/*
 * Entry with a shared code instead of email + password.
 * The code is checked here on the server (never shipped to the browser). On a match the
 * server signs in one dedicated admin account and hands its session to the browser, so
 * every database security rule keeps working exactly as for a normal admin login.
 *
 * Works with no setup. Optional settings (Lovable → Cloud → Secrets):
 *   ADMIN_PIN        the entry code (default 2121)
 *   PIN_ADMIN_EMAIL  email of the dedicated admin account (default below)
 */
const DEFAULT_PIN = "2121";
const DEFAULT_EMAIL = "pin-admin@singles2027.app";

const MAX_TRIES = 5;
const LOCK_MS = 10 * 60 * 1000;
// Best effort: counts per server instance. Combined with the delay below it makes guessing slow.
const attempts = new Map<string, { n: number; until: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sameText(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Signs in the dedicated admin account without a password (one-time link made on the server). */
async function adminSession(url: string, anonKey: string, email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Make sure the account exists (first use creates it, already confirmed).
  const created = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    throw created.error;
  }

  // 2. A one-time sign-in token for it.
  const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const userId = link.data.user?.id;
  const tokenHash = link.data.properties?.hashed_token;
  if (!userId || !tokenHash) throw new Error("no sign-in token");

  // 3. Make sure it has the admin role.
  const role = await supabaseAdmin
    .from("user_roles")
    .upsert(
      { user_id: userId, role: "admin" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (role.error) throw role.error;

  // 4. Exchange the token for a normal session.
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let v = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (v.error || !v.data.session)
    v = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (v.error || !v.data.session) throw v.error ?? new Error("no session");
  return v.data.session;
}

export const pinLogin = createServerFn({ method: "POST" })
  .validator((d: { code: string }) => ({
    code: String(d?.code ?? "")
      .trim()
      .slice(0, 64),
  }))
  .handler(async ({ data }): Promise<PinResult> => {
    const PIN = process.env["ADMIN_PIN"] || DEFAULT_PIN;
    const EMAIL = process.env["PIN_ADMIN_EMAIL"] || DEFAULT_EMAIL;
    const URL_ = process.env["SUPABASE_URL"];
    const KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!URL_ || !KEY || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      console.error(
        "PIN login: missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY",
      );
      return { ok: false, reason: "setup" };
    }

    const req = getRequest();
    const ip =
      req?.headers.get("cf-connecting-ip") ||
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const now = Date.now();
    const rec = attempts.get(ip);
    if (rec && rec.until > now)
      return { ok: false, reason: "locked", retryInSec: Math.ceil((rec.until - now) / 1000) };

    await sleep(700); // slows down guessing

    if (!sameText(data.code, PIN)) {
      const n = (rec && rec.until <= now && rec.n >= MAX_TRIES ? 0 : (rec?.n ?? 0)) + 1;
      attempts.set(ip, { n, until: n >= MAX_TRIES ? now + LOCK_MS : 0 });
      if (attempts.size > 5000) attempts.clear();
      return n >= MAX_TRIES
        ? { ok: false, reason: "locked", retryInSec: LOCK_MS / 1000 }
        : { ok: false, reason: "wrong" };
    }
    attempts.delete(ip);

    try {
      const s = await adminSession(URL_, KEY, EMAIL);
      return { ok: true, access_token: s.access_token, refresh_token: s.refresh_token };
    } catch (e) {
      console.error("PIN admin sign-in failed", e instanceof Error ? e.message : e);
      return { ok: false, reason: "error" };
    }
  });
