/**
 * Moving to a lower plan (#800, #801; the Terms' "Moving to a lower plan").
 * What is over the plan's limits becomes read-only: team members beyond
 * the limit are paused, products and posts beyond it are hidden from the
 * site, and extra locations and sites stop taking orders and bookings.
 * Nothing is deleted, and moving back up restores everything at once.
 *
 * **Derived, never stored.** What is paused is worked out from the plan the
 * business reads now (`CatalogueAccessService.resolve`) and a fixed order,
 * every time it is asked. Nothing marks a row paused, so a move back up
 * un-pauses everything the moment the plan reads higher, and no job has
 * to put anything back. The one stored thing is the clock: the business
 * is told first, and nothing pauses until 7 days after it was told what
 * would pause (a `CustomerNotice` claim, {@link MOVE_DOWN_CLAIM_KIND},
 * keyed by the limits it was told about). See `over-limit.service.ts`.
 *
 * **Who and what stays** (the order is fixed; the owner can't pick):
 *
 * - Team (`teamMembers`, DEC-105, DEC-111): the owner always; then everyone
 *   who uses a seat, by when they joined (a team member's membership, a
 *   diary person with no login), earliest first; then open invitations, by
 *   when they were sent. Past the limit, a team member can't open the
 *   business and an invitation can't be accepted. View-only people
 *   (`reviewers`) the same way, against their own limit.
 * - Products and blog posts: the most recently created, up to the limit,
 *   stay on the site; older ones are hidden from it and read-only in the
 *   workspace.
 * - Locations (`shopLocations`, only `SHOP` storefronts, DEC-109) and
 *   websites (`sites`, DEC-094): the first ones made stay; later ones stop
 *   taking orders and bookings, their stock and history kept.
 *
 * Never touched: invoices, orders, customers and payment records.
 *
 * Pure: the service reads the rows, this decides.
 */
import type { ModuleAccess } from "@saroh/pricing-catalog";

import type { SeatKind } from "./seats";

/** The catalogue rows whose limits pause things, and the key each meters. */
export const PAUSE_ROWS = {
    members: "teamMembers",
    reviewers: "reviewers",
    products: "products",
    blog: "blogPosts",
    locations: "shopLocations",
    sites: "sites",
} as const;

export type PauseRow = keyof typeof PAUSE_ROWS;
export type PauseKey = (typeof PAUSE_ROWS)[PauseRow];

/** The keys, in a fixed order (the claim's key is built in it). */
export const PAUSE_KEYS: readonly PauseKey[] = [
    "teamMembers",
    "reviewers",
    "products",
    "blogPosts",
    "shopLocations",
    "sites",
];

/** Each key's cap; null when nothing caps it. */
export type PauseLimits = Record<PauseKey, number | null>;

/** Nothing capped: what a business off the catalogue, or unenforced, reads. */
export const UNCAPPED: PauseLimits = {
    teamMembers: null,
    reviewers: null,
    products: null,
    blogPosts: null,
    shopLocations: null,
    sites: null,
};

/** How long the business has between being told and anything pausing. */
export const PAUSE_NOTICE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The grace clock's claim (`CustomerNotice.kind`). */
export const MOVE_DOWN_CLAIM_KIND = "MOVE_DOWN";

/**
 * A told claim is kept this long while the business isn't (yet) on the
 * limits it was told about: the furthest ahead a move is told (30 days),
 * and a day's slack.
 */
export const MOVE_DOWN_CLAIM_KEEP_DAYS = 31;

/**
 * The caps a business's rows put on what pauses, as the metered writes
 * read them (`rowGate`): a row the plan leaves off caps at nothing (0); a
 * row that is off but soft, or has no limit, or that the catalogue doesn't
 * know, caps nothing (null).
 */
export function pauseLimitsOf(modules: readonly ModuleAccess[]): PauseLimits {
    const out: PauseLimits = { ...UNCAPPED };
    for (const [row, key] of Object.entries(PAUSE_ROWS) as [
        PauseRow,
        PauseKey,
    ][]) {
        const m = modules.find((x) => x.moduleId === row);
        if (!m) continue;
        if (m.state !== "on") {
            out[key] = m.soft ? null : 0;
            continue;
        }
        out[key] = m.limit;
    }
    return out;
}

/** The limits as a stable string: what a grace claim is keyed by. */
export function limitsKey(limits: PauseLimits): string {
    return PAUSE_KEYS.map((k) => `${k}=${limits[k] ?? "none"}`).join(",");
}

/** The claim's `eventKey` for these limits. */
export function moveDownClaimKey(limits: PauseLimits): string {
    return `move-down:${limitsKey(limits)}`;
}

/** Whether a claim key was made for these limits. */
export function claimIsFor(eventKey: string, limits: PauseLimits): boolean {
    return eventKey === moveDownClaimKey(limits);
}

/** When something told at `toldAt` may pause: 7 days on. */
export function pausesFrom(toldAt: Date): Date {
    return new Date(toldAt.getTime() + PAUSE_NOTICE_DAYS * DAY_MS);
}

/**
 * When a move told at `toldAt` and taking effect at `effectiveAt` pauses
 * anything: the move, but never sooner than 7 days after the notice.
 */
export function pauseDate(toldAt: Date, effectiveAt: Date): Date {
    const earliest = pausesFrom(toldAt);
    return earliest > effectiveAt ? earliest : effectiveAt;
}

/**
 * Whether a grace claim stands: kept while the business is over the very
 * limits it was told about, and for a month while it isn't on them yet (a
 * move told ahead). A claim the business has left behind (it moved up, or
 * is back under) goes, so a later move down is told, and waited for, again.
 */
export function claimStands(input: {
    eventKey: string;
    toldAt: Date;
    /** The limits it reads now; null when nothing is enforced. */
    current: PauseLimits | null;
    over: boolean;
    now: Date;
}): boolean {
    const forNow = input.current
        ? claimIsFor(input.eventKey, input.current)
        : false;
    if (forNow) return input.over;
    const age = input.now.getTime() - input.toldAt.getTime();
    return age < MOVE_DOWN_CLAIM_KEEP_DAYS * DAY_MS;
}

/** Something with a creation time and a tie-breaking id. */
export interface Dated {
    id: string;
    createdAt: Date;
}

function byNewest(a: Dated, b: Dated): number {
    const t = b.createdAt.getTime() - a.createdAt.getTime();
    return t !== 0 ? t : b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

function byOldest(a: Dated, b: Dated): number {
    return -byNewest(a, b);
}

/** The most recently created `limit` stay; the rest pause. */
export function keepNewest<T extends Dated>(
    items: readonly T[],
    limit: number | null,
): { kept: T[]; paused: T[] } {
    const sorted = [...items].sort(byNewest);
    if (limit === null) return { kept: sorted, paused: [] };
    const n = Math.max(0, limit);
    return { kept: sorted.slice(0, n), paused: sorted.slice(n) };
}

/** The first `limit` made stay; the later ones pause. */
export function keepOldest<T extends Dated>(
    items: readonly T[],
    limit: number | null,
): { kept: T[]; paused: T[] } {
    const sorted = [...items].sort(byOldest);
    if (limit === null) return { kept: sorted, paused: [] };
    const n = Math.max(0, limit);
    return { kept: sorted.slice(0, n), paused: sorted.slice(n) };
}

/**
 * Where "newest N" cuts a table too big to list (products, posts): the
 * oldest row still kept. A row created before it (or at the same instant
 * with a smaller id) is paused. `"all"`: a limit of 0, nothing kept.
 * Null: nothing paused.
 */
export type Cut = null | "all" | { createdAt: Date; id: string };

/** Whether a row is paused under a cut. */
export function pausedByCut(row: Dated, cut: Cut): boolean {
    if (cut === null) return false;
    if (cut === "all") return true;
    const t = row.createdAt.getTime() - cut.createdAt.getTime();
    return t < 0 || (t === 0 && row.id < cut.id);
}

/**
 * The Prisma `where` for the rows a cut keeps (products, posts): newer
 * than the oldest kept, or as new with an id at least its. Spread into a
 * read's `AND`.
 */
export function keptByCut(cut: Cut):
    | Record<string, never>
    | { id: { in: string[] } }
    | {
          OR: (
              | { createdAt: { gt: Date } }
              | { createdAt: Date; id: { gte: string } }
          )[];
      } {
    if (cut === null) return {};
    if (cut === "all") return { id: { in: [] } };
    return {
        OR: [
            { createdAt: { gt: cut.createdAt } },
            { createdAt: cut.createdAt, id: { gte: cut.id } },
        ],
    };
}

/** One person on the team, as the order needs them. */
export interface TeamPerson extends Dated {
    /** A team member (membership), a diary person with no login, or an open invitation. */
    kind: "member" | "diary" | "invite";
    /** What they are called in a notice: a name, else an email. */
    label: string;
    owner: boolean;
    seat: SeatKind;
}

/**
 * Who of one seat kind stays: the owner always (never paused, whatever
 * the limit), then team members and diary people by when they joined,
 * then open invitations by when they were sent; up to `limit` in all.
 */
export function keepTeam(
    people: readonly TeamPerson[],
    seat: SeatKind,
    limit: number | null,
): { kept: TeamPerson[]; paused: TeamPerson[] } {
    const mine = people.filter((p) => p.seat === seat);
    const owners = mine.filter((p) => p.owner).sort(byOldest);
    const joined = mine
        .filter((p) => !p.owner && p.kind !== "invite")
        .sort(byOldest);
    const invites = mine.filter((p) => p.kind === "invite").sort(byOldest);
    const ordered = [...owners, ...joined, ...invites];
    if (limit === null) return { kept: ordered, paused: [] };
    const room = Math.max(0, limit - owners.length);
    const rest = [...joined, ...invites];
    return {
        kept: [...owners, ...rest.slice(0, room)],
        paused: rest.slice(room),
    };
}

/** A place that stops taking orders (a location or a website). */
export interface NamedPlace extends Dated {
    name: string;
}

/**
 * What the limits pause, measured. Each list is what pauses; `over` is
 * whether anything does.
 */
export interface PauseMeasure {
    limits: PauseLimits;
    /** People past their limit (team members, diary people, invitations). */
    people: TeamPerson[];
    products: { cut: Cut; count: number };
    posts: { cut: Cut; count: number };
    locations: NamedPlace[];
    sites: NamedPlace[];
}

/** Whether anything at all pauses. */
export function anythingPauses(m: PauseMeasure): boolean {
    return (
        m.people.length > 0 ||
        m.products.count > 0 ||
        m.posts.count > 0 ||
        m.locations.length > 0 ||
        m.sites.length > 0
    );
}

/**
 * What is paused right now, for the reads and writes that enforce it.
 * Ids are small sets (people, places); products and posts are a cut.
 */
export interface PausedNow {
    organizationId: string;
    /** When it started pausing (7 days after the business was told). */
    since: Date;
    /** Team members (membership ids) who can't open the business. */
    memberIds: ReadonlySet<string>;
    /** Open invitations that can't be accepted. */
    invitationIds: ReadonlySet<string>;
    /** Diary people with no login past the limit (staff ids). */
    diaryIds: ReadonlySet<string>;
    products: Cut;
    posts: Cut;
    /** Storefronts (locations) that stop taking orders. */
    storeIds: ReadonlySet<string>;
    /** Websites that stop taking orders and bookings. */
    siteIds: ReadonlySet<string>;
}

/** {@link PausedNow} from a measure. */
export function pausedFromMeasure(
    organizationId: string,
    since: Date,
    m: PauseMeasure,
): PausedNow {
    const ids = (kind: TeamPerson["kind"]) =>
        new Set(m.people.filter((p) => p.kind === kind).map((p) => p.id));
    return {
        organizationId,
        since,
        memberIds: ids("member"),
        invitationIds: ids("invite"),
        diaryIds: ids("diary"),
        products: m.products.count > 0 ? m.products.cut : null,
        posts: m.posts.count > 0 ? m.posts.cut : null,
        storeIds: new Set(m.locations.map((l) => l.id)),
        siteIds: new Set(m.sites.map((s) => s.id)),
    };
}

/** What a notice lists: exactly what will pause. */
export interface PauseSummary {
    /** People by name (or email), team then view-only, in pause order. */
    people: string[];
    products: number;
    posts: number;
    locations: string[];
    sites: string[];
}

export function summaryOf(m: PauseMeasure): PauseSummary {
    return {
        people: m.people.map((p) => p.label),
        products: m.products.count,
        posts: m.posts.count,
        locations: m.locations.map((l) => l.name),
        sites: m.sites.map((s) => s.name),
    };
}

/** Whether a summary lists anything. */
export function summaryEmpty(s: PauseSummary): boolean {
    return (
        s.people.length === 0 &&
        s.products === 0 &&
        s.posts === 0 &&
        s.locations.length === 0 &&
        s.sites.length === 0
    );
}

function plural(n: number, one: string, many: string): string {
    return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

function list(names: readonly string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The lines a notice lists, one per kind of thing, in the merchant's
 * words. Empty when nothing pauses.
 */
export function pauseLines(s: PauseSummary): string[] {
    const out: string[] = [];
    if (s.people.length > 0) {
        out.push(
            `${list(s.people)} ${s.people.length === 1 ? "is" : "are"} paused: they can't open the business until you move up again.`,
        );
    }
    if (s.products > 0) {
        out.push(
            `${plural(s.products, "product", "products")}, your oldest, ${s.products === 1 ? "is" : "are"} hidden from your site and read-only.`,
        );
    }
    if (s.posts > 0) {
        out.push(
            `${plural(s.posts, "blog post", "blog posts")}, your oldest, ${s.posts === 1 ? "is" : "are"} hidden from your site and read-only.`,
        );
    }
    if (s.locations.length > 0) {
        out.push(
            `${list(s.locations)} ${s.locations.length === 1 ? "stops" : "stop"} taking orders. Stock and history are kept.`,
        );
    }
    if (s.sites.length > 0) {
        out.push(
            `${list(s.sites)} ${s.sites.length === 1 ? "stops" : "stop"} taking orders and bookings.`,
        );
    }
    return out;
}

/** The sentence every notice ends with: how to keep everything. */
export const KEEP_EVERYTHING =
    "Nothing is deleted. To keep everything, choose or renew a plan in Plan and billing; moving back up restores everything at once.";
