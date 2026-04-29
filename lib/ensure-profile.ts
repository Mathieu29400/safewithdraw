/**
 * ensureProfile — guarantees a `public.profiles` row exists for the given user.
 *
 * Why this exists
 * ---------------
 * The `on_auth_user_created` trigger on `auth.users` is supposed to create the
 * matching `profiles` row at signup. In practice we can't fully rely on it:
 *
 *   - Accounts created BEFORE the trigger was deployed have no profile.
 *   - The trigger could fail silently (RLS, search_path, schema drift).
 *   - The trigger fires after `auth.users` insert, but if the client races
 *     to `urssaf_profile.insert(...)` before that transaction commits in
 *     production, the FK to `profiles.id` blows up.
 *
 * Strategy
 * --------
 * Use a single atomic INSERT … ON CONFLICT (id) DO NOTHING via supabase-js
 * `upsert({ ignoreDuplicates: true })`. This is:
 *
 *   - **Idempotent** — re-running on an existing profile is a no-op.
 *   - **Race-free** — Postgres serializes the conflict check inside the
 *     INSERT statement; two parallel callers can't both succeed in
 *     creating distinct rows.
 *   - **RLS-safe** — `profiles_insert_own` requires `id = auth.uid()`, and
 *     because `ignoreDuplicates: true` issues `ON CONFLICT DO NOTHING`
 *     instead of an UPDATE, we never need the (also-permitted) update
 *     policy to fire. We only ever write rows we own.
 */

import { supabase } from "./supabase";

export type EnsureProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function ensureProfile(user: {
  id: string;
  email: string;
}): Promise<EnsureProfileResult> {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, email: user.email },
      { onConflict: "id", ignoreDuplicates: true },
    );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
