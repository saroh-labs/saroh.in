/**
 * Thin re-export of the canonical org-scoped HTTP plumbing (see
 * `lib/api/http.ts`). Kept so the CRM clients (contacts, leads, pipelines,
 * services, messages, payments — S3-005) keep importing `@/lib/crm/http`
 * unchanged after the plumbing was consolidated (#102). Server-only.
 */

export * from "../api/http";
