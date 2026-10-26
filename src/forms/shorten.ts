import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALIAS_RE } from "./links";

export type ShortenResult =
  | { ok: true; shortUrl: string }
  | {
      ok: false;
      reason: "taken" | "invalid" | "busy" | "unavailable" | "forbidden";
      message?: string;
    };

/**
 * Makes a tiny link with a custom name through is.gd (free, no account).
 * Runs on the server: the browser can't call is.gd directly, and only admins may use it.
 */
export const createTinyLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { url: string; alias: string }) => {
    const url = String(d?.url ?? "");
    const alias = String(d?.alias ?? "");
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2000) throw new Error("bad url");
    if (!ALIAS_RE.test(alias)) throw new Error("bad alias");
    return { url, alias };
  })
  .handler(async ({ data, context }): Promise<ShortenResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false, reason: "forbidden" };

    const endpoint = process.env["SHORTENER_URL"] || "https://is.gd/create.php";
    const q = new URLSearchParams({
      format: "json",
      url: data.url,
      shorturl: data.alias,
      logstats: "1",
    });
    try {
      const res = await fetch(`${endpoint}?${q}`, {
        headers: { "User-Agent": "singles2027-admin" },
      });
      const body = (await res.json()) as {
        shorturl?: string;
        errorcode?: number;
        errormessage?: string;
      };
      if (body.shorturl) return { ok: true, shortUrl: body.shorturl };
      const msg = body.errormessage ?? "";
      // is.gd error codes: 1 = bad long URL, 2 = custom name invalid or already taken, 3 = rate limited, 4 = service error
      if (body.errorcode === 2)
        return {
          ok: false,
          reason: /taken|already|exists|use/i.test(msg) ? "taken" : "invalid",
          message: msg,
        };
      if (body.errorcode === 3) return { ok: false, reason: "busy", message: msg };
      if (body.errorcode === 1) return { ok: false, reason: "invalid", message: msg };
      return { ok: false, reason: "unavailable", message: msg };
    } catch (e) {
      console.error("is.gd request failed", e);
      return { ok: false, reason: "unavailable" };
    }
  });
