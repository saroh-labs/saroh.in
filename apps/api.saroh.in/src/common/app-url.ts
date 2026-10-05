import { env } from "../env";

/**
 * The workspace's own origin, with no trailing slash, for links in emails
 * staff open: `APP_URL`, which a deployed API must set (`env.ts`), else the
 * production address in tests and the local app in development. The one
 * place this is worked out (plan 2026-10-05-001).
 */
export function appBase(): string {
    const base =
        env.APP_URL ??
        (env.NODE_ENV === "development"
            ? "https://app.saroh.localhost"
            : "https://app.saroh.in");
    return base.replace(/\/$/, "");
}
