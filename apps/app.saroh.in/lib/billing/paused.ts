/**
 * What a move to a lower plan has paused (#800), as the workspace marks
 * it. The API decides (`GET …/billing/paused`, `billing/paused-view.ts`);
 * this only reads its answer, compares a listed item against the cut it
 * sends, and words it. No limit, plan or price is known here.
 *
 * The words match the API's refusals (`billing/paused-errors.ts`
 * `pausedWords`), so a mark and a refused save say the same.
 */

/** The API's cut: the oldest kept row, "all", or null (nothing paused). */
export type PausedCut = null | "all" | { createdAt: string; id: string };

export interface PausedPerson {
    id: string;
    /** member: a membership id; diary: a staff id; invite: an invitation id. */
    kind: "member" | "diary" | "invite";
    label: string;
    /** A team member's user id: Team lists people by it. */
    userId?: string;
}

export interface PausedPlace {
    id: string;
    name: string;
}

/** `GET organizations/:org/billing/paused`. */
export interface PausedView {
    /** paused: now. pending: over, and pauses at `pausesFrom`. none: nothing. */
    state: "paused" | "pending" | "none";
    pausesFrom: string | null;
    /** Null when the reader may not see the team. */
    people: PausedPerson[] | null;
    products: { cut: PausedCut; count: number };
    posts: { cut: PausedCut; count: number };
    /** Null when the reader may not see locations. */
    locations: PausedPlace[] | null;
    /** Null when the reader may not see websites. */
    sites: PausedPlace[] | null;
}

/** Where to keep everything. */
export const PLAN_AND_BILLING_HREF = "/settings/billing#change-plan";

/**
 * Whether a listed row (a product, a post) is past the cut: created before
 * the oldest one kept, or at the same instant with a smaller id. The API's
 * `pausedByCut`, over the wire. A row with no creation time is never
 * marked: the API still refuses its write, and says why.
 */
export function pausedByCut(
    row: { id: string; createdAt?: string | null },
    cut: PausedCut | undefined,
): boolean {
    if (!cut) return false;
    if (cut === "all") return true;
    if (!row.createdAt) return false;
    const t = Date.parse(row.createdAt) - Date.parse(cut.createdAt);
    if (Number.isNaN(t)) return false;
    return t < 0 || (t === 0 && row.id < cut.id);
}

/**
 * Whether a post is paused: only a live post counts toward the blog posts
 * limit (a draft is never on the site), so only a live one past the cut.
 */
export function postPaused(
    post: { id: string; createdAt?: string | null; live?: boolean },
    cut: PausedCut | undefined,
): boolean {
    return post.live === true && pausedByCut(post, cut);
}

/** Only what is paused now marks a row; "pending" is the banner's alone. */
export function activeCut(
    view: PausedView | null,
    kind: "products" | "posts",
): PausedCut {
    return view?.state === "paused" ? view[kind].cut : null;
}

/** Who on the Team screen is paused now. */
export interface PausedTeam {
    /** Team members, by user id. */
    userIds: string[];
    /** Open invitations, by invitation id. */
    invitationIds: string[];
    /**
     * People on the diary with no login, by staff id and name: they take
     * no new bookings; the bookings already made are kept.
     */
    diary: { id: string; label: string }[];
}

export const NONE_PAUSED: PausedTeam = {
    userIds: [],
    invitationIds: [],
    diary: [],
};

/**
 * Who on the Team screen is paused now: team members by user id, open
 * invitations by invitation id. Empty unless paused now.
 */
export function pausedTeam(view: PausedView | null): PausedTeam {
    if (view?.state !== "paused" || !view.people) return NONE_PAUSED;
    return {
        userIds: view.people.flatMap((p) =>
            p.kind === "member" && p.userId ? [p.userId] : [],
        ),
        invitationIds: view.people
            .filter((p) => p.kind === "invite")
            .map((p) => p.id),
        diary: view.people
            .filter((p) => p.kind === "diary")
            .map((p) => ({ id: p.id, label: p.label })),
    };
}

/**
 * Whether anyone on Team is paused now: the team is over its plan's limit,
 * not just at it. Team then says "over", and leaves out the plan's
 * "reached your limit" card, whose "everyone already on the team keeps
 * access" is no longer true; the paused notes say why and link to Plan
 * and billing.
 */
export function teamOverLimit(team: PausedTeam): boolean {
    return (
        team.userIds.length > 0 ||
        team.invitationIds.length > 0 ||
        team.diary.length > 0
    );
}

function joinNames(names: readonly string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Why someone on the diary with no login takes no new bookings: the API's
 * words (`billing/paused-errors.ts` `diaryPausedWords`), so the Team mark,
 * the calendar and a refused booking say the same.
 */
export function diaryPausedWords(names: readonly string[]): string {
    const who = names.length > 0 ? joinNames(names) : "This person";
    const are = names.length > 1 ? "are" : "is";
    return `${who} ${are} paused. Your plan includes fewer team members than you have, so the people who joined most recently take no new bookings. Bookings already made are kept. Choose a plan in Plan and billing to bring them back.`;
}

/** The ids of locations not taking orders now. */
export function pausedLocationIds(view: PausedView | null): string[] {
    if (view?.state !== "paused" || !view.locations) return [];
    return view.locations.map((l) => l.id);
}

/** The ids of websites not taking orders and bookings now. */
export function pausedSiteIds(view: PausedView | null): string[] {
    if (view?.state !== "paused" || !view.sites) return [];
    return view.sites.map((s) => s.id);
}

/** What a paused thing is, in the business's words. */
export type PausedKind = "product" | "post" | "location" | "site" | "person";

const WHAT: Record<PausedKind, { one: string; why: string }> = {
    product: {
        one: "This product",
        why: "Your plan includes fewer products than you have, so your oldest are hidden from your site and read-only.",
    },
    post: {
        one: "This blog post",
        why: "Your plan includes fewer blog posts than you have, so your oldest are hidden from your site and read-only.",
    },
    location: {
        one: "This location",
        why: "Your plan includes fewer locations than you have, so the newest ones stopped taking orders. Stock and history are kept.",
    },
    site: {
        one: "This website",
        why: "Your plan includes fewer websites than you have, so the newest ones stopped taking orders and bookings.",
    },
    person: {
        one: "This person",
        why: "Your plan includes fewer team members than you have, so the people who joined most recently can't open the business. Nothing of theirs is lost.",
    },
};

/** One paused thing: what, why, and the way back (the API's words). */
export function pausedWords(kind: PausedKind): string {
    const w = WHAT[kind];
    return `${w.one} is paused. ${w.why} Choose a plan in Plan and billing to bring it back.`;
}

/** Why, for a list's notice above its rows, with how many. */
export function pausedListWords(
    kind: "product" | "post",
    count: number,
): string {
    const noun =
        kind === "product"
            ? count === 1
                ? "product is"
                : "products are"
            : count === 1
              ? "blog post is"
              : "blog posts are";
    const plan = kind === "product" ? "products" : "blog posts";
    return `${count.toLocaleString("en-IN")} ${noun} paused. Your plan includes fewer ${plan} than you have, so your oldest are hidden from your site and read-only. Choose a plan in Plan and billing to bring ${count === 1 ? "it" : "them"} back.`;
}

function plural(n: number, one: string, many: string): string {
    return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

/** The kinds of thing a view pauses, short ("2 products, 1 location"). */
export function pausedParts(view: PausedView): string[] {
    const parts: string[] = [];
    const people = view.people?.length ?? 0;
    if (people > 0) parts.push(plural(people, "team member", "team members"));
    if (view.products.count > 0)
        parts.push(plural(view.products.count, "product", "products"));
    if (view.posts.count > 0)
        parts.push(plural(view.posts.count, "blog post", "blog posts"));
    const places = view.locations?.length ?? 0;
    if (places > 0) parts.push(plural(places, "location", "locations"));
    const sites = view.sites?.length ?? 0;
    if (sites > 0) parts.push(plural(sites, "website", "websites"));
    return parts;
}

function joinParts(parts: readonly string[]): string {
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The shell's banner: what is paused (or will be) and how to keep it.
 * Null when there is nothing to say. A pending pause's date is the
 * component's to draw (`pausesFrom`).
 */
export function pausedBanner(
    view: PausedView | null,
): { title: string; body: string; pausesFrom: string | null } | null {
    if (!view || view.state === "none") return null;
    const parts = pausedParts(view);
    const what = parts.length > 0 ? joinParts(parts) : "Some of what you have";
    if (view.state === "paused") {
        return {
            title: `Paused by your plan: ${what}`,
            body: "Your plan includes less than you have, so what's over its limits is read-only: hidden from your site, or not taking orders. Nothing is deleted. Choose a plan in Plan and billing to bring everything back at once.",
            pausesFrom: null,
        };
    }
    return {
        title: `Your plan includes less than you have: ${what} will pause`,
        body: "Nothing is deleted. To keep everything, choose or renew a plan in Plan and billing.",
        pausesFrom: view.pausesFrom,
    };
}
