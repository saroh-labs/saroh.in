import type { CalendarBusyView } from "./dto";

type PersonState = CalendarBusyView["people"][number]["state"];
const RANK: Record<PersonState, number> = {
    CONNECTED: 2,
    PAUSED: 1,
    LAPSED: 0,
};

/**
 * One state a person: one account working is connected; a live Google
 * account Saroh holds back (over the plan's allowance) is PAUSED, which
 * reconnecting won't fix; a lapsed one needs reconnecting.
 */
export function busyPeople(
    connections: {
        id: string;
        status: string;
        membership: { staffMember: { id: string } | null };
    }[],
    allowed: Set<string> | null,
): CalendarBusyView["people"] {
    const states = new Map<string, PersonState>();
    for (const c of connections) {
        const staffId = c.membership.staffMember?.id;
        if (!staffId) continue;
        const state: PersonState =
            c.status !== "CONNECTED"
                ? "LAPSED"
                : allowed?.has(c.id)
                  ? "CONNECTED"
                  : "PAUSED";
        const had = states.get(staffId);
        if (had === undefined || RANK[state] > RANK[had]) {
            states.set(staffId, state);
        }
    }
    return [...states].map(([staffId, state]) => ({ staffId, state }));
}
