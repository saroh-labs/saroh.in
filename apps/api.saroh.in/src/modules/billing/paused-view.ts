/**
 * `GET organizations/:org/billing/paused` (#800): what a move to a lower
 * plan has paused, or will pause, for the workspace to mark where it lists
 * things (a banner, the Products and Posts lists and editors, Team, the
 * locations). Derived like everything else (`over-limit.ts`): nothing here
 * is stored.
 *
 * Who may read it: anyone in the business. The people who list products,
 * posts or locations are not all billing people (a Member edits products
 * but can't read billing), and they need to know why an item is read-only.
 * What each part names follows what the reader may already see: people
 * only with `member:read` (the roster), locations only with `store:read`,
 * websites only with `site:read`. Product and post cuts are a date and an
 * id: nothing a reader of either list doesn't already have.
 *
 * Pure: the controller passes the standing and the context.
 */
import type { OrganizationContext } from "../../common/types/organization-context";
import { allows } from "../organizations/organization-policy";
import type { Cut, TeamPerson } from "./over-limit";
import type { OverLimitStanding } from "./over-limit.service";

/** A cut on the wire: ISO time and id, "all", or null for nothing. */
export type CutView = null | "all" | { createdAt: string; id: string };

export interface PausedPersonView {
    id: string;
    /** member: a membership id; diary: a staff id; invite: an invitation id. */
    kind: TeamPerson["kind"];
    label: string;
    /** A team member's user id: the Team screen lists people by it. */
    userId?: string;
}

export interface PausedPlaceView {
    id: string;
    name: string;
}

export interface PausedView {
    /**
     * "paused": things are paused now. "pending": the business is over its
     * limits and was told (or is about to be); things pause at `pausesFrom`.
     * "none": nothing is over, or nothing is enforced.
     */
    state: "paused" | "pending" | "none";
    /** When pausing starts (ISO); null when not told yet, or nothing over. */
    pausesFrom: string | null;
    /** People past the limit; null when the reader may not see the team. */
    people: PausedPersonView[] | null;
    products: { cut: CutView; count: number };
    posts: { cut: CutView; count: number };
    /** Null when the reader may not see storefronts. */
    locations: PausedPlaceView[] | null;
    /** Null when the reader may not see websites. */
    sites: PausedPlaceView[] | null;
}

export const NOTHING_PAUSED: PausedView = {
    state: "none",
    pausesFrom: null,
    people: [],
    products: { cut: null, count: 0 },
    posts: { cut: null, count: 0 },
    locations: [],
    sites: [],
};

function cutView(cut: Cut): CutView {
    if (cut === null || cut === "all") return cut;
    return { createdAt: cut.createdAt.toISOString(), id: cut.id };
}

/** The view for a business's standing, as this reader may see it. */
export function pausedView(
    standing: OverLimitStanding | null,
    ctx: Pick<OrganizationContext, "role" | "actions">,
    /** Membership id → user id, for the paused team members. */
    userIds: ReadonlyMap<string, string> = new Map(),
): PausedView {
    if (!standing?.over) return NOTHING_PAUSED;
    const m = standing.measure;
    const may = (a: Parameters<typeof allows>[1]) =>
        allows(ctx as OrganizationContext, a);
    return {
        state: standing.paused ? "paused" : "pending",
        pausesFrom: standing.pausesFrom?.toISOString() ?? null,
        people: may("member:read")
            ? m.people.map((p) => {
                  const userId =
                      p.kind === "member" ? userIds.get(p.id) : undefined;
                  return {
                      id: p.id,
                      kind: p.kind,
                      label: p.label,
                      ...(userId ? { userId } : {}),
                  };
              })
            : null,
        products: {
            cut: m.products.count > 0 ? cutView(m.products.cut) : null,
            count: m.products.count,
        },
        posts: {
            cut: m.posts.count > 0 ? cutView(m.posts.cut) : null,
            count: m.posts.count,
        },
        locations: may("store:read")
            ? m.locations.map((l) => ({ id: l.id, name: l.name }))
            : null,
        sites: may("site:read")
            ? m.sites.map((s) => ({ id: s.id, name: s.name }))
            : null,
    };
}
