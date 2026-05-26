# Coding Agent Rules (Communications Hub)

These rules capture patterns and lessons learned while implementing the Communications Hub feature.

- Do not add "use server" to page files unless you are implementing server actions.
  - Server components do not require `"use server"`; that directive is for modules exporting server actions and enforces async-only exports.

- For dynamic App Router pages, check the project pattern for `params` handling and support async `params` when required.
  - Next can pass `params` as a Promise in some versions; await `params` when necessary: `const resolvedParams = typeof params.then === 'function' ? await params : params`.

- Avoid `toLocaleString()` in text rendered on both server and client.
  - Use deterministic formatting (e.g., `toISOString()`) for SSR + client-rendered text to prevent hydration mismatches.

- Always confirm real database table names before creating foreign keys in migrations.
  - Verify the schema in repository migrations or the target DB (e.g., `scheduled_jobs` vs `jobs`).

- When Row-Level Security (RLS) depends on `auth.uid()`, browser/client inserts must include the `user_id` field.
  - Use `supabase.auth.getUser()` on the client or perform server-side inserts to populate `user_id` and satisfy RLS policies.

- Do not assume TypeScript passing equals functional correctness.
  - TypeScript may pass while runtime logic (routing, RLS, or DB constraints) fails; perform runtime verification.

- Manual or automated end-to-end checks are required before marking a feature complete.
  - Test list, create, and detail navigation manually or with browser/Playwright tests to validate UI + data flows.

Use this document as a concise checklist when acting as a coding agent in this repository.
