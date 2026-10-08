import { normaliseSiteHost } from "@/lib/site-host-mode";

/**
 * Whether `/template-renders` answers (industry templates U14).
 *
 * A template drawn for its sample business, from fixtures, with no API: the
 * page the gallery's and the picker's 2× captures are taken from
 * (`e2e/marketing-shots/template-shots.ts`). It is a tool, not a page anyone
 * visits, so it answers only when all three hold:
 *
 * - **Switched on**: `TEMPLATE_RENDERS=on` (`pnpm --filter sites
 *   dev:templates` sets it). Unset or `off`, a 404.
 * - **Not a production deployment**: `VERCEL_ENV=production` refuses even
 *   with the switch on, so a stray variable cannot put sample businesses
 *   on saroh.app.
 * - **The renderer's own host**: the apex (`NEXT_PUBLIC_ROOT_DOMAIN`), never
 *   a merchant's address. The middleware already rewrites every tenant
 *   host into `/[domain]/…`, where `/template-renders` would be one of that
 *   merchant's own pages; this is the second lock, so a change there can
 *   never serve a sample business on someone's site.
 *
 * Pure, so the rule is tested on its own (`guard.test.ts`).
 */
export function templateRendersAllowed({
    host,
    rootDomain,
    flag,
    vercelEnv,
}: {
    /** The request's `Host`, port and all. */
    host: string | null | undefined;
    /** The renderer's apex: `saroh.app`, or `saroh.app.localhost` locally. */
    rootDomain: string;
    flag: string | undefined;
    vercelEnv: string | undefined;
}): boolean {
    if (flag !== "on") return false;
    if (vercelEnv === "production") return false;
    const bare = normaliseSiteHost(host ?? "");
    const root = normaliseSiteHost(rootDomain);
    return bare !== "" && root !== "" && bare === root;
}
