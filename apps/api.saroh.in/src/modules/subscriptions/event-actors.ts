import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PLATFORM_OPERATOR_ROLE_KEY } from "../audit/audit.service";

/**
 * Who a plan event (D2) or a subscription event (D9) is recorded as, and
 * how the logs name them. One rule for both, so an operator is masked the
 * same way everywhere (DEC-035).
 */

/**
 * A team member; the customer, from their own account (epic A); the renewal
 * job; a Saroh operator, shown as Saroh support.
 */
export const EVENT_ACTOR_KINDS = [
    "TEAM",
    "CUSTOMER",
    "JOB",
    "OPERATOR",
] as const;
export type EventActorKind = (typeof EVENT_ACTOR_KINDS)[number];

export interface EventActor<K extends EventActorKind = EventActorKind> {
    actorKind: K;
    actorUserId: string | null;
}

/**
 * Who a request's change is recorded as. A Saroh operator acts through a
 * `platform-operator` context and is recorded as OPERATOR, which the read
 * shows as Saroh support, never by name (DEC-035).
 */
export function actorFromContext(
    ctx: OrganizationContext,
): EventActor<"TEAM" | "OPERATOR"> {
    return {
        actorKind:
            ctx.roleKey === PLATFORM_OPERATOR_ROLE_KEY ? "OPERATOR" : "TEAM",
        actorUserId: ctx.userId,
    };
}

/** The renewal job: no person, shown as Saroh. */
export const JOB_ACTOR: EventActor<"JOB"> = {
    actorKind: "JOB",
    actorUserId: null,
};

export interface EventActorView<K extends EventActorKind = EventActorKind> {
    kind: K;
    /** Null for Saroh support, the job and a customer, whose ids aren't shown. */
    userId: string | null;
    /**
     * The team member's name as it is now, "Saroh support" for an operator,
     * "Saroh" for the job; null for a customer (the screen names the
     * subscriber) and for someone with no name.
     */
    name: string | null;
}

/** The names, as they are now, of the team members among these rows. */
export async function teamNames(
    rows: readonly { actorKind: string; actorUserId: string | null }[],
): Promise<ReadonlyMap<string, string | null>> {
    const ids = [
        ...new Set(
            rows.flatMap((e) =>
                e.actorKind === "TEAM" && e.actorUserId ? [e.actorUserId] : [],
            ),
        ),
    ];
    if (ids.length === 0) return new Map();
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
}

export function actorView<K extends EventActorKind>(
    kind: K,
    userId: string | null,
    names: ReadonlyMap<string, string | null>,
): EventActorView<K> {
    // An operator's own id would tell the business which of Saroh's staff it
    // was, and tie their changes together across businesses (DEC-035).
    if (kind === "OPERATOR") {
        return { kind, userId: null, name: "Saroh support" };
    }
    if (kind === "JOB") return { kind, userId: null, name: "Saroh" };
    if (kind === "CUSTOMER") return { kind, userId: null, name: null };
    return {
        kind,
        userId,
        name: userId ? (names.get(userId) ?? null) : null,
    };
}
