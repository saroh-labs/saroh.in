import { cache } from "react";

import { env } from "@/env";

import { readEarnings } from "./commission";
import { getJson } from "./control-plane";
import { instanceApps } from "./sibling-apps";
import type { TeamMember } from "./team-member-words";

/**
 * A teammate's page (DEC-169, admin console U22), as the console reads
 * it. Server-only: the tabs take the types from `team-member-words.ts`.
 */

/**
 * One teammate's page, read once per request for the layout and its tab.
 * Null when the API refuses it: an Account manager opening someone else's.
 */
export const getTeamMember = cache(
    (platformAdminId: string): Promise<TeamMember | null> =>
        getJson<TeamMember>(
            `/team/members/${encodeURIComponent(platformAdminId)}`,
        ),
);

/** Their earnings, once per request (`team:pay`; null when refused). */
export const getMemberEarnings = cache((platformAdminId: string) =>
    readEarnings(platformAdminId),
);

/**
 * Where the public site lives, for a manager's `?am=` link: the env's
 * `MARKETING_SITE_URL`, else the instance's website app, else saroh.in.
 */
export async function marketingSiteUrl(): Promise<string> {
    const instance = env.MARKETING_SITE_URL
        ? null
        : await instanceApps().catch(() => null);
    return (
        env.MARKETING_SITE_URL ??
        instance?.apps.find((app) => app.key === "website")?.href ??
        "https://www.saroh.in"
    ).replace(/\/+$/, "");
}
