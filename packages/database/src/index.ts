export * from "./client";
/*
 * The block contract lives in @saroh/block-contract now (#252) — it imports
 * only zod, and a NestJS server, three browsers and the template package all
 * need it, while only this package needs Prisma.
 *
 * Re-exported rather than moved outright so every existing
 * `import { ctaHref, parseSectionContent } from "@saroh/database"` keeps
 * resolving. Frontends must import @saroh/block-contract directly: this
 * package stays on their ESLint ban list, and for the same reason as always.
 */
export * from "@saroh/block-contract";
export * from "./org-context";
export * from "./rls-proxy";
