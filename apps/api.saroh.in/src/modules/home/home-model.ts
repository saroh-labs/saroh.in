import type { OrgRole } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import { can } from "../organizations/organization-policy";

/**
 * The shapes `GET /home` answers with, and the small helpers every Home
 * source shares. They live apart from `HomeService` so the sources in their
 * own files (`home-money-sources.ts`, `home-site-stock-sources.ts`) can
 * build actions without importing the service that imports them.
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

/**
 * The colour a row's tag is drawn in, as the design names them: `bad` for
 * something already wrong (late, failed, blocked), `due` for something to do
 * soon, `info` for something to know. The tag's words always say it too, so
 * the colour is never the only signal.
 */
export type HomeTone = "bad" | "due" | "info";

/**
 * How many rows of evidence an action carries. Five is what fits on Home
 * without turning it into the list screen it links to; `count` still reports the
 * true total, so "5 of 23" is expressible and nothing is silently hidden.
 */
export const EVIDENCE_LIMIT = 5;

/**
 * One concrete row behind an action's count.
 *
 * `amountMinor` is in MINOR units and `currency` may be null, because the two
 * sources disagree and pretending otherwise would print wrong money: an Order
 * stores a Decimal with an explicit currency, while a CRM Lead stores a bare
 * integer with no currency at all. A null currency means "this number has no
 * stated currency" and the client must render it without a symbol — not guess
 * one from the locale.
 */
export interface HomeEvidence {
    id: string;
    /** The thing itself — a lead's title, an order's number. */
    title: string;
    /** Who it concerns, when known. */
    subtitle: string | null;
    /** ISO instant this row is measured from: due date, or placed date. */
    at: string | null;
    amountMinor: number | null;
    currency: string | null;
    href: string;
    /** What happened, in a few words: "Late · 2 days", "Payment failed". */
    tag?: string;
    tone?: HomeTone;
    /**
     * The row's title on Needs you, when it says more than `title`: "Send
     * order #1042 to Anika Rao" for the order numbered 1042.
     */
    headline?: string;
    /** A few more words for the line under it, e.g. an invoice's first line. */
    detail?: string;
    /** The action the row offers in place (F4), set by `home-inline.ts`. */
    inline?: HomeInline;
}

export interface HomeAction {
    code: string;
    title: string;
    href: string;
    severity: HomeSeverity;
    moduleKey?: string;
    /** The true total behind the action, which may exceed `evidence.length`. */
    count?: number;
    evidence?: HomeEvidence[];
    /** The action's own tag, when it is one row rather than a list of them. */
    tag?: string;
    tone?: HomeTone;
    /**
     * The worst of what `count` holds past `evidence` — "bad" when any of the
     * rows "N more" stands for is late — so that row ranks with its worst,
     * not with the last row shown. Absent, it ranks beside the last row.
     */
    moreTone?: HomeTone;
}

/**
 * A booking on the schedule band.
 *
 * `timezone` travels with every row rather than being resolved here: a booking
 * is stored in absolute UTC plus the zone the booker saw, and an Organization
 * has no single timezone to fold them into. Deciding server-side what counts as
 * "today" would be wrong for any merchant whose bookers are not in their zone,
 * so the client groups by each booking's own day.
 */
export interface HomeBooking {
    id: string;
    startAt: string;
    endAt: string;
    timezone: string;
    serviceName: string;
    who: string | null;
    status: string;
    href: string;
}

/**
 * A part of Home that could not be read.
 *
 * The difference between "you have no open orders" and "we could not find out
 * whether you have open orders" is the whole of PRODUCT_STRATEGY §30, and the
 * client cannot render a difference the API does not express.
 */
export interface HomeUnavailable {
    /** Module key the failed source belongs to, e.g. `COMMERCE`. */
    moduleKey: string;
    /** What the merchant would call it, e.g. "Open orders". */
    label: string;
}

/** The inline actions a Needs-you row can carry (F4). */
export type HomeInlineKind = "MARK_SENT" | "RETRY" | "SEND_REMINDER" | "REPLY";

/**
 * How a Retry is made (F4, D13): `PAY_LINK`, a fresh pay link; `MANDATE`,
 * a new charge on the customer's autopay. No Retry is offered while such a
 * charge is under way ("Autopay charge in progress").
 */
export type HomeRetryVia = "PAY_LINK" | "MANDATE";

/**
 * What an inline action on a Needs-you row will do (F4), decided by the API
 * (`home-inline.ts`): it is sent only to a viewer who may do it, only when
 * the write it calls can take it, and its words say truthfully who is told
 * and how. A row without one stays a link.
 *
 * Every action calls the target's own endpoint — the order's stage move,
 * the subscription's retry, the invoice's reminder, the customer's thread —
 * and Home adds no write of its own.
 */
export interface HomeInline {
    kind: HomeInlineKind;
    /** The row's button: "Mark sent". */
    label: string;
    /** What will happen, and who is told, said before it happens. */
    confirm: string;
    /** The confirm's button: "Mark sent and tell Anika". */
    yes: string;
    /** What the row says once it's done: "Reminder sent to Farah". */
    done: string;
    /**
     * A message leaves the business. The app holds it ten seconds (default
     * 51) before it goes, and Undo in that time means nothing leaves; after
     * it, no Undo.
     */
    sends: boolean;
    /** Whether Undo is offered after (never once a message has left). */
    undoable: boolean;
    /** What it acts on: the order, subscription, invoice or contact id. */
    target: string;
    /** The customer's first name, for what the toast says after; else null. */
    person: string | null;
    /** MARK_SENT: the step it moves the order to. */
    stage?: string;
    /** RETRY: how it is retried. */
    via?: HomeRetryVia;
}

/**
 * One row of Needs you (F3): one thing to do, with the words for it.
 *
 * The flat list is the ranked actions again, with each action's evidence
 * promoted to a row of its own (a row per order, not "3 open orders"), so
 * the ranking stays on the server. Money travels in minor units beside the
 * words and is placed by `amountIn`, because formatting it is the client's
 * (`formatMoney`): "₹4,800 overdue from Farah Khan" is `amountIn: "title"`
 * with the title "overdue from Farah Khan".
 */
export interface HomeNeed {
    /** Stable across reads: the action's code, and the row's own id. */
    id: string;
    /** The action it came from, e.g. `COMMERCE_OPEN_ORDERS`. */
    code: string;
    severity: HomeSeverity;
    title: string;
    /** The line under the title, without its money. */
    sub: string | null;
    amountMinor: number | null;
    currency: string | null;
    /** Where the amount goes: before the title, before the line, or nowhere. */
    amountIn: "title" | "sub" | null;
    /** The tag's words; the tone is never the only signal. */
    tag: string | null;
    tone: HomeTone;
    href: string;
    moduleKey?: string;
    inline?: HomeInline;
}

/**
 * The kinds of row on Home's Today column (F5): a one-to-one booking, a
 * class, a pick-up. The column is built in `home-today.ts`.
 */
export type HomeTodayKind = "BOOKING" | "CLASS" | "PICKUP";

export interface HomeTodayItem {
    /** The booking's id; a class's `class:<service>:<start>`; the order's id. */
    id: string;
    kind: HomeTodayKind;
    /** ISO instant it starts, or for a pick-up when it should be ready. */
    startAt: string;
    /** "09:30", in the business's zone. */
    time: string;
    /** "Cleaning · Farah Khan", "Morning Yoga class", "Pick-up · Anika Rao". */
    what: string;
    /** "With Dr. Arun · pays at the desk", "Order #1042 · Ready". */
    who: string | null;
    /** The person a booking is for, for "Farah Khan arrived."; else null. */
    person: string | null;
    /** How it went, said by a person; null until someone says. */
    outcome: "ATTENDED" | "NO_SHOW" | null;
    /** When that was said, "09:32" in the business's zone. */
    outcomeTime: string | null;
    /** A pick-up's kitchen stage (`READY` is ready to hand over). */
    stage: string | null;
    /** The person's Needs attention labels this viewer may read. */
    flags: string[];
    href: string;
    /** Whether this viewer may mark it Arrived or No-show (`booking:write`). */
    markable: boolean;
}

export interface HomeToday {
    /** The zone the day is kept in, e.g. `Asia/Kolkata`. */
    zone: string;
    /** The business's date, `2026-09-27`. */
    date: string;
    /**
     * Whether the day's bookings were read: only then may an empty column
     * say "Nothing else booked today".
     */
    bookings: boolean;
    items: HomeTodayItem[];
}

/** What a Last 24 hours figure counts (F6). */
export type HomeSinceKind = "ORDERS" | "BOOKINGS" | "REVIEWS" | "PAYMENTS";

/**
 * One figure of Home's "Last 24 hours" strip (F6): a count, or for money
 * the amount taken in one currency, and the link that opens exactly the
 * rows it counts. Only figures above zero are sent; the words are the
 * client's, as money's formatting is.
 */
export interface HomeSinceItem {
    kind: HomeSinceKind;
    count: number;
    /** Payments only: what came in, in minor units, and its currency. */
    amountMinor: number | null;
    currency: string | null;
    href: string;
}

/**
 * The greeting's clock and the last 24 hours (F6), in the business's zone
 * (DEC-033), as F5's Today is.
 */
export interface HomeLastDay {
    /** The zone the day is kept in, e.g. `Asia/Kolkata`. */
    zone: string;
    /** The business's date, `2026-09-18`. */
    date: string;
    /** For "Good morning": the business's clock, not the viewer's. */
    partOfDay: "morning" | "afternoon" | "evening";
    /** ISO instant the window opens: 24 hours before this read. */
    since: string;
    /**
     * Nothing sold, booked or paid yet, told only to someone who may set
     * the business up (`org:update`): Home says "Welcome" and shows no strip.
     */
    fresh: boolean;
    /** The figures above zero this viewer may read; empty when none. */
    items: HomeSinceItem[];
}

/**
 * This week's takings against last week's same days (F7): up, down or level
 * by a whole percent, or `THIN` — too little last week to compare.
 */
export type HomeWeekChange =
    { kind: "UP" | "DOWN" | "LEVEL"; percent: number } | { kind: "THIN" };

/** Takings so far this week in one currency (F7), net of refunds. */
export interface HomeWeekTakings {
    currency: string;
    amountMinor: number;
    /** The same days last week, in the same currency. */
    lastWeekMinor: number;
    change: HomeWeekChange;
    /** The invoices paid since Monday. */
    href: string;
}

/** What is owed to the business (F7): issued, unpaid, not an order's own. */
export interface HomeWeekOwed {
    totals: { currency: string; amountMinor: number }[];
    /** Unpaid bills, of every currency. */
    bills: number;
    /** Of those, past their due date. */
    overdue: number;
    href: string;
}

/**
 * Home's "This week" (F7). Each figure is present only for a viewer who
 * holds its read, and absent — never zero — otherwise: takings with
 * `payment:read` and `invoice:read`, bookings with `booking:read`, orders
 * with `order:read` or `order:stage`, owed with `invoice:read`.
 */
export interface HomeWeek {
    /** The zone the week is kept in. */
    zone: string;
    /** This week's Monday in that zone, `2026-09-14`. */
    startDate: string;
    /** One per currency taken this week; empty when nothing came in. */
    takings?: HomeWeekTakings[];
    /** Confirmed bookings Monday to Sunday, and the whole of last week. */
    bookings?: { count: number; lastWeek: number; href: string };
    /** Orders placed since Monday. */
    orders?: { count: number; href: string };
    /** Absent too for a business that has never billed outside an order. */
    owed?: HomeWeekOwed;
}

/**
 * Whose Home this is: the business's; a Reviewer's, which carries only the
 * sites they were asked to review (F9); or a staff member's, narrowed to
 * the storefronts they work on and their own diary (F11).
 */
export type HomeView = "business" | "reviewer" | "staff";

/** A storefront a staff member's Home is narrowed to (F11). */
export interface HomeStaffStore {
    id: string;
    name: string;
}

/**
 * What a staff member's Home covers (F11), for the header's "Hill Road
 * only". Which rows they see is still their own capabilities'.
 */
export interface HomeStaff {
    /**
     * The storefronts they work on, by name; null for every storefront —
     * none assigned, or all of them.
     */
    stores: HomeStaffStore[] | null;
    /** Today shows their own bookings: they are on the diary. */
    ownDiary: boolean;
}

/** A page of a site a Reviewer was asked to review (F9). */
export interface HomeReviewPage {
    id: string;
    title: string;
    path: string;
    /** Notes left on this page that nobody has settled. */
    openNotes: number;
    /** The Review tab, opened on this page. */
    href: string;
}

/**
 * A site a Reviewer was granted (F9, `SiteReviewer`), as their Home lists
 * it: its pages, who asked for the review and when while it waits on them,
 * and the notes still open. Never a site they weren't granted.
 */
export interface HomeReviewSite {
    id: string;
    name: string;
    /** `/sites/:id/review`. */
    href: string;
    /** Who asked for the review, while nobody has answered it; else null. */
    requestedBy: string | null;
    /** ISO instant it was asked for, while it waits; else null. */
    requestedAt: string | null;
    /** Open notes on the whole site, pages gone included. */
    openNotes: number;
    /** Its visible pages, home first, up to five. */
    pages: HomeReviewPage[];
    /** Every visible page, for "2 more pages". */
    pageCount: number;
    /** The public address's label, for "See the live site". */
    subdomain: string | null;
    /** Whether it has been published. */
    live: boolean;
}

export interface HomeModel {
    /** Whose Home this is; `reviewer` sends `reviews` and nothing else. */
    view: HomeView;
    /** What a staff member's Home is narrowed to; only on `view: "staff"`. */
    staff?: HomeStaff;
    /**
     * A Reviewer's sites (F9), present only on `view: "reviewer"`. Empty
     * when they have none — or when the read failed, which `unavailable`
     * then names.
     */
    reviews?: HomeReviewSite[];
    /**
     * The ranked actions `needs` is flattened from. The workspace's rail
     * reads its badges from them (OVERDUE ones with a count), so they stay.
     * `primaryAction` and `numbers`, the old Home's other fields, were
     * removed in Z5 once no live app read them.
     */
    actions: HomeAction[];
    hasAnyModule: boolean;
    /**
     * Confirmed bookings from now forward (up to eight): Needs you's "Next"
     * line reads the first.
     */
    upcoming: HomeBooking[];
    /**
     * Sources that failed. Empty on a healthy read. Non-empty means what is
     * shown is INCOMPLETE, and Home must say so rather than presenting the
     * subset as the whole picture (§30).
     */
    unavailable: HomeUnavailable[];
    /**
     * Needs you, flat and ranked (F3): every row the sources carry, in the
     * order Home shows them; the client shows the first twelve, then "See
     * all".
     */
    needs: HomeNeed[];
    /**
     * How many things need doing: one per row, except a source's "3 more
     * open orders" row, which stands for the three it counted but didn't send.
     */
    needsTotal: number;
    /**
     * The business's day (F5): its bookings, classes and pick-ups in time
     * order. Null when the viewer reads none of them, or when the read
     * failed (then `unavailable` names "Today").
     */
    today: HomeToday | null;
    /**
     * The header (F6). Always sent; when its read fails, `items` is empty
     * and `unavailable` names "The last 24 hours".
     */
    lastDay: HomeLastDay;
    /**
     * This week (F7): null when the viewer reads none of its figures, or
     * when the read failed (then `unavailable` names "This week"). Never
     * sent to a Reviewer.
     */
    week?: HomeWeek | null;
}

export interface HomeInput {
    organizationId: string;
    /** The viewer: a Reviewer's Home reads only their own grants (F9). */
    userId?: string;
    organizationRole: OrgRole;
    /** Resolved permissions; see `AvailabilityInput.organizationActions`. */
    organizationActions?: ReadonlySet<OrgAction>;
    projectId?: string;
}

/** Whether the caller holds `action`: their resolved set, else their role's. */
export function holds(input: HomeInput, action: OrgAction): boolean {
    return input.organizationActions
        ? input.organizationActions.has(action)
        : can(input.organizationRole, action);
}

/** A person's display name from optional name parts, falling back to email. */
export function personName(person: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
}): string | null {
    const full = [person.firstName, person.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (full) return full;
    // NOT `?? null`: an email of "" is not nullish, so `??` would return the
    // empty string and the caller would render a blank line where it expects
    // either a name or a deliberate absence.
    const email = person.email?.trim();
    return email !== undefined && email.length > 0 ? email : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Late · 2 days", as the Home design tags it: whole days since `dueAt`, and
 * never "0 days" — something past due by an hour is already late, so it
 * reads "Late · 1 day".
 */
export function overdueTag(dueAt: Date, now: Date): string {
    const days = Math.max(
        1,
        Math.floor((now.getTime() - dueAt.getTime()) / DAY_MS),
    );
    return `Late · ${days} day${days === 1 ? "" : "s"}`;
}
