import type { FormDef } from "./types";

/** Paths the site itself uses; a form link can't take these names. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "manage",
  "f",
  "api",
  "assets",
  "static",
  "login",
  "preview",
  "_build",
  "favicon.ico",
  "robots.txt",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

/** Turn whatever was typed into a valid link name: lowercase, dashes, no spaces. */
export const cleanSlug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function slugProblem(s: string): "format" | "reserved" | null {
  if (s.length < 2 || !SLUG_RE.test(s)) return "format";
  if (RESERVED_SLUGS.has(s)) return "reserved";
  return null;
}

/** Full public address of a form. The home form lives at "/". */
export const formUrl = (origin: string, slug: string, home?: boolean) =>
  `${origin}${home ? "/" : `/${slug}`}`;

/* is.gd custom names: 5–30 characters, English letters, numbers and underscores. */
export const ALIAS_RE = /^[A-Za-z0-9_]{5,30}$/;
export const suggestAlias = (slug: string) => slug.replace(/-/g, "_").slice(0, 30);

/** Compare drafts while ignoring admin-only share info. */
export const withoutShare = (d: FormDef | null) => {
  if (!d) return d;
  const { share: _share, ...rest } = d;
  void _share;
  return rest;
};
