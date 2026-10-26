import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { blankForm } from "./defaults";
import type {
  Answers,
  FileAnswers,
  FormDef,
  FormRow,
  PublicForm,
  ResponseRow,
  ResponseStatus,
  TemplateId,
} from "./types";
import { allFields } from "./types";

// The forms tables are newer than the generated database types, so talk to them untyped.
const db = () => supabase as unknown as SupabaseClient;

const BUCKET = "logos";

/** True when the error means the forms tables/functions aren't installed yet. */
export function isMissingSetup(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find")
  );
}

/*
 * "Database update part 3" (docs/forms-setup-3-update.sql) adds version history, preview links,
 * response status/notes and shared tiny links. Until it is applied everything else keeps
 * working: these helpers notice the missing columns and fall back to the older layout.
 */
let update3: boolean | null = null;

/** True once the part-3 database update is installed (checked once per page load). */
export async function hasUpdate3(): Promise<boolean> {
  if (update3 !== null) return update3;
  const { error } = await db().from("form_responses").select("status, notes").limit(1);
  if (error && !isMissingSetup(error)) return true; // some other hiccup: don't remember it
  update3 = !error;
  return update3;
}

/** Thrown by features that need the part-3 database update. */
export class NeedsUpdateError extends Error {
  constructor() {
    super("needs database update part 3");
  }
}

/* ---------------- public ---------------- */

type PublicRow = {
  id: string;
  slug: string;
  template: TemplateId;
  accent: string | null;
  status: "open" | "closed";
  def: FormDef;
  accepting?: boolean;
};

export async function getHomeForm(): Promise<PublicForm | null> {
  const { data, error } = await db().rpc("get_home_form");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as PublicRow | undefined;
  return row ?? null;
}

export async function getPublicForm(slug: string): Promise<PublicForm | null> {
  const { data, error } = await db().rpc("get_public_form", { _slug: slug });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as PublicRow | undefined;
  return row ?? null;
}

/** The DRAFT of a form, for someone holding its secret preview link. */
export async function getPreviewForm(slug: string, token: string): Promise<PublicForm | null> {
  const { data, error } = await db().rpc("get_preview_form", { _slug: slug, _token: token });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as PublicRow | undefined;
  return row ?? null;
}

/** Whether the form takes answers right now: open, before its closing date, not full. */
export function isAccepting(f: Pick<PublicForm, "status" | "def" | "accepting">) {
  if (f.status !== "open" || f.accepting === false) return false;
  const closeAt = f.def.settings?.closeAt;
  if (closeAt && Date.now() >= new Date(closeAt).getTime()) return false;
  return true;
}

const safeExt = (name: string) =>
  (name.split(".").pop() || "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "bin";

async function uploadFiles(formId: string, responseId: string, files: Record<string, File[]>) {
  const paths: FileAnswers = {};
  const stamp = Date.now().toString(36);
  for (const [qid, list] of Object.entries(files)) {
    if (!list.length) continue;
    paths[qid] = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i]!;
      const path = `forms/${formId}/${responseId}/${qid}-${stamp}-${i + 1}.${safeExt(file.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw error;
      paths[qid].push(path);
    }
  }
  return paths;
}

const labelsOf = (def: FormDef) => {
  const labels: Record<string, string> = {};
  for (const f of allFields(def)) labels[f.id] = f.label;
  return labels;
};

/** Saves one sign-up (public form, or an admin adding one by hand). */
export async function submitResponse(
  form: Pick<PublicForm, "id" | "def">,
  answers: Answers,
  files: Record<string, File[]>,
) {
  const id = crypto.randomUUID();
  const paths = await uploadFiles(form.id, id, files);
  const { error } = await db()
    .from("form_responses")
    .insert({ id, form_id: form.id, answers, labels: labelsOf(form.def), files: paths });
  if (error) throw error;
}

/* ---------------- admin: forms ---------------- */

const BASE_FORM_COLS =
  "id, slug, title, template, accent, status, is_home, draft, published, published_at, created_at, updated_at";
const formCols = async () =>
  (await hasUpdate3()) ? `${BASE_FORM_COLS}, history, preview_token` : BASE_FORM_COLS;
const FORM_COLS = BASE_FORM_COLS;

export async function listForms(): Promise<FormRow[]> {
  const { data, error } = await db()
    .from("forms")
    .select(await formCols())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FormRow[];
}

export async function getForm(id: string): Promise<FormRow | null> {
  const { data, error } = await db()
    .from("forms")
    .select(await formCols())
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as FormRow) ?? null;
}

export function randomSlug() {
  return Math.random().toString(36).slice(2, 8);
}

export async function createForm(opts: {
  slug?: string;
  title: string;
  template: TemplateId;
  accent?: string | null;
  draft?: FormDef;
}): Promise<FormRow> {
  const draft = opts.draft ?? blankForm();
  const { data, error } = await db()
    .from("forms")
    .insert({
      slug: opts.slug ?? randomSlug(),
      title: opts.title,
      template: opts.template,
      accent: opts.accent ?? null,
      status: "open",
      draft,
    })
    .select(FORM_COLS)
    .single();
  if (error) throw error;
  return data as FormRow;
}

export async function duplicateForm(src: FormRow, title: string): Promise<FormRow> {
  return createForm({
    title,
    template: src.template,
    accent: src.accent,
    draft: (() => {
      const d = structuredClone(src.draft);
      delete d.share; // the tiny link belongs to the original form
      return d;
    })(),
  });
}

export async function saveDraft(
  id: string,
  patch: Partial<Pick<FormRow, "title" | "draft" | "template" | "accent" | "slug">>,
) {
  const { error } = await db()
    .from("forms")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

const HISTORY_KEEP = 20;

/**
 * Makes the draft the live version. The version that was live until now is kept in
 * the form's history (newest first, last 20) so it can be restored later.
 * Returns the new history.
 */
export async function publishForm(form: FormRow, draft: FormDef) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    draft,
    published: draft,
    published_at: now,
    updated_at: now,
  };
  let history = form.history ?? [];
  if ((await hasUpdate3()) && form.published) {
    history = [{ at: form.published_at ?? form.updated_at, def: form.published }, ...history].slice(
      0,
      HISTORY_KEEP,
    );
    patch["history"] = history;
  }
  const { error } = await db().from("forms").update(patch).eq("id", form.id);
  if (error) throw error;
  return history;
}

/** Turns the secret preview link on (new random token) or off (null). */
export async function setPreviewToken(id: string, on: boolean) {
  if (!(await hasUpdate3())) throw new NeedsUpdateError();
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = on
    ? Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")
    : null;
  const { error } = await db().from("forms").update({ preview_token: token }).eq("id", id);
  if (error) throw error;
  return token;
}

export async function setFormStatus(id: string, status: "open" | "closed") {
  const { error } = await db().from("forms").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function setHomeForm(id: string) {
  const { error } = await db().rpc("set_home_form", { _form_id: id });
  if (error) throw error;
}

export async function deleteForm(f: FormRow) {
  const { data: rows } = await db().from("form_responses").select("files").eq("form_id", f.id);
  const paths = ((rows ?? []) as { files: FileAnswers }[]).flatMap((r) =>
    Object.values(r.files ?? {}).flat(),
  );
  const { error } = await db().from("forms").delete().eq("id", f.id);
  if (error) throw error;
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  }
}

export async function isSlugFree(slug: string, exceptId: string) {
  const { data, error } = await db()
    .from("forms")
    .select("id")
    .eq("slug", slug)
    .neq("id", exceptId)
    .limit(1);
  if (error) throw error;
  return !(data ?? []).length;
}

/* ---------------- admin: responses ---------------- */

export type ResponseStub = { form_id: string; created_at: string };

/** Light list of every response (form + time) for the counts on the forms screen. */
export async function listResponseStubs(): Promise<ResponseStub[]> {
  const out: ResponseStub[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("form_responses")
      .select("form_id, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as ResponseStub[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function listResponses(formId: string): Promise<ResponseRow[]> {
  const out: ResponseRow[] = [];
  const cols =
    "id, form_id, answers, labels, files, created_at" +
    ((await hasUpdate3()) ? ", status, notes, updated_at" : "");
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db()
      .from("form_responses")
      .select(cols)
      .eq("form_id", formId)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(
      ...((data ?? []) as unknown as ResponseRow[]).map((r) => ({
        ...r,
        answers: r.answers ?? {},
        labels: r.labels ?? {},
        files: r.files ?? {},
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Saves the handling status and/or the private note of a sign-up. */
export async function updateResponseMeta(
  id: string,
  patch: { status?: ResponseStatus; notes?: string },
) {
  if (!(await hasUpdate3())) throw new NeedsUpdateError();
  const { error } = await db().from("form_responses").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * An admin edits the answers of a sign-up. Files: a question with newly chosen files gets
 * those (the old files are deleted); questions with no new files keep what they had.
 */
export async function updateResponseAnswers(
  r: ResponseRow,
  def: FormDef,
  answers: Answers,
  newFiles: Record<string, File[]>,
) {
  const uploaded = await uploadFiles(r.form_id, r.id, newFiles);
  const files: FileAnswers = { ...r.files, ...uploaded };
  const patch: Record<string, unknown> = {
    answers,
    files,
    labels: { ...r.labels, ...labelsOf(def) },
  };
  if (await hasUpdate3()) patch["updated_at"] = new Date().toISOString();
  const { error } = await db().from("form_responses").update(patch).eq("id", r.id);
  if (error) throw error;
  const replaced = Object.keys(uploaded).flatMap((q) => r.files[q] ?? []);
  if (replaced.length) await supabase.storage.from(BUCKET).remove(replaced);
  return { ...r, ...patch } as ResponseRow;
}

export async function deleteResponse(r: ResponseRow) {
  const { error } = await db().from("form_responses").delete().eq("id", r.id);
  if (error) throw error;
  const paths = Object.values(r.files ?? {}).flat();
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

export async function signedUrls(paths: string[], seconds: number) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, seconds);
  data?.forEach((d) => d.path && d.signedUrl && map.set(d.path, d.signedUrl));
  return map;
}

/* ---------------- admin: tiny links (shared by everyone) ---------------- */

export type ShortLinkRow = {
  id: string;
  short_url: string;
  alias: string;
  target: string;
  created_at: string;
};

/** null = the shared list isn't installed yet (database update part 3). */
export async function listShortLinks(): Promise<ShortLinkRow[] | null> {
  const { data, error } = await db()
    .from("short_links")
    .select("id, short_url, alias, target, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingSetup(error)) return null;
    throw error;
  }
  return (data ?? []) as ShortLinkRow[];
}

/** Saves tiny links to the shared list (ignores ones already there). false = not installed. */
export async function saveShortLinks(
  rows: { short_url: string; alias: string; target: string; created_at?: string }[],
) {
  if (!rows.length) return true;
  const { error } = await db()
    .from("short_links")
    .upsert(rows, { onConflict: "short_url", ignoreDuplicates: true });
  if (error) {
    if (isMissingSetup(error)) return false;
    throw error;
  }
  return true;
}

export async function deleteShortLink(id: string) {
  const { error } = await db().from("short_links").delete().eq("id", id);
  if (error) throw error;
}
