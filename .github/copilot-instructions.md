# Copilot instructions

The instructions for every AI agent in this repository live in one place:
**[`AGENTS.md`](../AGENTS.md)** at the root, plus `apps/*/AGENTS.md` for the app
you are working in. Read those; this file only repeats the rules that fail
silently.

- **Only `apps/api.saroh.in` touches the database.** Frontends never import
  `@saroh/database`, nor a package that depends on it (`@saroh/templates`).
- **Organization is the tenant root** (ADR-001). The API derives it from the
  session; never accept it from the caller.
- **Better Auth via `@saroh/auth` is the only auth system.**
- **Read environment through each app's typed `env.ts`**, never `process.env`.
- **Run apps with portless at `https://<app>.saroh.localhost`**, never a bare
  port (`docs/architecture/LOCAL_DEV.md`).
- **Merchant sites never inherit Saroh's brand** (`--site-*` tokens).

How the codebase is built, by area: [`docs/patterns/README.md`](../docs/patterns/README.md).
Do not copy architecture into this file — it drifted once already.
