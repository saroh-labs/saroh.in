import { prisma } from "@saroh/database";

import { activeTeam } from "../organizations/team-powers";
import type { AlertEvent } from "./alert-preferences";
import { alertOn, mayHearAbout } from "./alert-preferences";

/**
 * The distinct emails of everyone on the team who may read what `event`
 * tells (their role's row plus their own extras) and has email on for it,
 * paused members left out. Never asked of a role's name (audit 2026-11-12).
 */
export async function emailedAbout(
    organizationId: string,
    event: AlertEvent,
): Promise<string[]> {
    const [team, choices] = await Promise.all([
        activeTeam(organizationId),
        prisma.notificationPreference.findMany({
            where: { organizationId, event, channel: "email" },
            select: { userId: true, event: true, channel: true, enabled: true },
        }),
    ]);
    const to = team
        .filter(
            (m) =>
                m.email !== "" &&
                mayHearAbout(event, (a) => m.actions.has(a), m.role) &&
                alertOn(
                    choices.filter((c) => c.userId === m.userId),
                    event,
                    "email",
                ),
        )
        .map((m) => m.email);
    return [...new Set(to)];
}
