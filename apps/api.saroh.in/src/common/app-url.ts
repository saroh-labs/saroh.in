import { prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { environmentOfHost, hostsFor, urlOf } from "@saroh/edition";

import { env } from "../env";

/**
 * The workspace's own origin, with no trailing slash, for links in emails
 * staff open: `APP_URL`, which a deployed API must set (`env.ts`), else the
 * production address in tests and the local app in development. The one
 * place this is worked out (plan 2026-10-05-001).
 *
 * Given an edition, the app that edition is served from in the same
 * environment (DEC-204). A local stack has one app, so it stays on it.
 */
export function appBase(edition?: Edition): string {
    const base =
        env.APP_URL ??
        (env.NODE_ENV === "development"
            ? "https://app.saroh.localhost"
            : "https://app.saroh.in");
    const environment = edition ? environmentOfHost(new URL(base).host) : null;
    return (
        edition && environment
            ? urlOf(hostsFor(edition, environment).app)
            : base
    ).replace(/\/$/, "");
}

/** {@link appBase} for a business, when the caller hasn't read its edition. */
export async function appBaseOf(organizationId: string): Promise<string> {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { edition: true },
    });
    return appBase(organization?.edition);
}
