import { cache } from "react";

import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Home read-model access (#119). One aggregated call to api.saroh.in returns the
 * ranked next-actions for the active Organization, so the page never fans out.
 * Server-only.
 */
export type HomeSeverity = "ATTENTION" | "SETUP" | "OVERDUE" | "SUGGESTION";

/**
 * A Needs-you tag's colour, as the design names them: `bad` for something
 * already wrong, `due` for something to do soon, `info` for something to
 * know. The tag's words always say it too.
 */
export type HomeTone = "bad" | "due" | "info";

/**
 * What an inline action on a Needs-you row will do (F4). The API sends one
 * only to a viewer who may do it, only when the write can take it, with
 * words that say who is told and how (`home-inline.ts`). Each calls its
 * target's own endpoint; see `lib/home/inline-actions.ts` for how it runs.
 */
export interface HomeInline {
    kind: "MARK_SENT" | "RETRY" | "SEND_REMINDER" | "REPLY" | "REVIEW_REPLY";
    /** The row's button. */
    label: string;
    /** What will happen, and who is told. */
    confirm: string;
    /** The confirm's button. */
    yes: string;
    /** What the row says once done. */
    done: string;
    /** A message leaves the business: held ten seconds first. */
    sends: boolean;
    /** Whether Undo is offered (never once a message has left). */
    undoable: boolean;
    /** The order, subscription, invoice, contact or review it acts on. */
    target: string;
    /** The customer's first name, for the words after; null without one. */
    person: string | null;
    /** MARK_SENT: the step it moves the order to. */
    stage?: string;
    /**
     * RETRY: how — a new pay link, or a new charge on their autopay (D13).
     * The API offers no Retry while an autopay charge is under way.
     */
    via?: "PAY_LINK" | "MANDATE";
}

/**
 * A step a Needs-you row opens where it is taken, beside its inline action
 * (D14): "Send a set-up link" on a renewal whose autopay limit is too low
 * opens Subscription Detail's own set-up sheet. Sent only to someone who may
 * take it, while the business offers autopay.
 */
export interface HomeRowLink {
    label: string;
    href: string;
}

/**
 * One row of Needs you (F3), flat and already ranked by the API.
 *
 * Money travels in minor units beside the words, and `amountIn` says where
 * it goes: "₹4,800 overdue from Farah Khan" is the title "overdue from Farah
 * Khan" with `amountIn: "title"`. See `lib/home/needs.ts`.
 */
export interface HomeNeed {
    id: string;
    code: string;
    severity: HomeSeverity;
    title: string;
    sub: string | null;
    amountMinor: number | null;
    currency: string | null;
    amountIn: "title" | "sub" | null;
    tag: string | null;
    tone: HomeTone;
    href: string;
    moduleKey?: string;
    inline?: HomeInline;
    link?: HomeRowLink;
}

/**
 * One concrete row behind an action's count.
 *
 * `currency` is nullable on purpose and the client MUST respect it: a CRM lead
 * records an amount with no currency at all, while an order records one
 * explicitly. Rendering a symbol the API did not send would be inventing the
 * merchant's currency from their locale.
 */
export interface HomeEvidence {
    id: string;
    title: string;
    subtitle: string | null;
    at: string | null;
    amountMinor: number | null;
    currency: string | null;
    href: string;
}

export interface HomeAction {
    code: string;
    title: string;
    href: string;
    severity: HomeSeverity;
    moduleKey?: string;
    /** The true total, which may exceed `evidence.length`. */
    count?: number;
    evidence?: HomeEvidence[];
}

/** A booking on the schedule band, in the timezone it was booked in. */
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
 * A part of Home that could not be read (#177, §30).
 *
 * The API distinguishes "you have no open orders" from "we could not find out",
 * and Home has to render that difference — a screen that silently drops a
 * failed source reports "nothing to do" when the truth is "we do not know".
 */
export interface HomeUnavailable {
    moduleKey: string;
    label: string;
}

/**
 * One row of Home's Today column (F5), already in the business's clock.
 * See `lib/home/today.ts` for which rows show and what each says.
 */
export interface HomeTodayItem {
    id: string;
    kind: "BOOKING" | "CLASS" | "PICKUP";
    /** ISO instant it starts; for a pick-up, when it should be ready. */
    startAt: string;
    /** "09:30" in the business's zone. */
    time: string;
    what: string;
    who: string | null;
    /** The person a booking is for; null on a class or a pick-up. */
    person: string | null;
    outcome: "ATTENDED" | "NO_SHOW" | null;
    /** When the outcome was said, "09:32". */
    outcomeTime: string | null;
    /** A pick-up's kitchen stage. */
    stage: string | null;
    /** Needs attention labels this viewer may read. */
    flags: string[];
    href: string;
    /** May be marked Arrived or No-show by this viewer (`booking:write`). */
    markable: boolean;
}

/** The business's day (F5). */
export interface HomeToday {
    zone: string;
    /** `2026-09-18`. */
    date: string;
    /** Whether bookings were read, so an empty day may say so. */
    bookings: boolean;
    items: HomeTodayItem[];
}

/** What a Last 24 hours figure counts (F6). */
export type HomeSinceKind = "ORDERS" | "BOOKINGS" | "REVIEWS" | "PAYMENTS";

/**
 * One figure of "Last 24 hours" (F6). Money in minor units beside its
 * currency; `href` opens exactly the rows it counts. See `lib/home/last-day.ts`.
 */
export interface HomeSinceItem {
    kind: HomeSinceKind;
    count: number;
    amountMinor: number | null;
    currency: string | null;
    href: string;
}

/** The greeting's clock and the last 24 hours, in the business's zone (F6). */
export interface HomeLastDay {
    zone: string;
    /** `2026-09-18`, the business's date. */
    date: string;
    partOfDay: "morning" | "afternoon" | "evening";
    /** ISO instant the window opens. */
    since: string;
    /** Nothing sold, booked or paid yet: "Welcome", and no strip. */
    fresh: boolean;
    items: HomeSinceItem[];
}

/**
 * This week's takings against the same days last week (F7): up, down or
 * level by a whole percent, or `THIN` — too little last week to compare.
 */
export type HomeWeekChange =
    { kind: "UP" | "DOWN" | "LEVEL"; percent: number } | { kind: "THIN" };

/** Takings so far this week in one currency (F7), net of refunds. */
export interface HomeWeekTakings {
    currency: string;
    amountMinor: number;
    lastWeekMinor: number;
    change: HomeWeekChange;
    /** The invoices paid since Monday. */
    href: string;
}

/** Owed to the business (F7): issued, unpaid, not an order's own. */
export interface HomeWeekOwed {
    totals: { currency: string; amountMinor: number }[];
    bills: number;
    overdue: number;
    href: string;
}

/**
 * This week (F7). The API sends each figure only to a viewer who holds its
 * read, so a missing figure is one this viewer may not see — never zero.
 * See `lib/home/week.ts` for the words.
 */
export interface HomeWeek {
    zone: string;
    /** This week's Monday in the business's zone, `2026-09-14`. */
    startDate: string;
    takings?: HomeWeekTakings[];
    bookings?: { count: number; lastWeek: number; href: string };
    orders?: { count: number; href: string };
    owed?: HomeWeekOwed;
}

/**
 * Whose Home this is: the business's, a Reviewer's (F9), or a staff
 * member's, narrowed to their storefronts and their own diary (F11).
 */
export type HomeView = "business" | "reviewer" | "staff";

/**
 * What a staff member's Home covers (F11). Which rows they see is still
 * their own capabilities', decided by the API.
 */
export interface HomeStaff {
    /** The storefronts they work on; null for every storefront. */
    stores: { id: string; name: string }[] | null;
    /** Today shows their own bookings: they are on the diary. */
    ownDiary: boolean;
}

/** A page of a site a Reviewer was asked to review (F9). */
export interface HomeReviewPage {
    id: string;
    title: string;
    path: string;
    openNotes: number;
    /** The Review tab, opened on this page. */
    href: string;
}

/**
 * A site a Reviewer was granted (F9): its pages, who asked for the review
 * and when while it waits on them, and the notes still open. The API sends
 * only the sites they were granted. See `lib/home/reviews.ts`.
 */
export interface HomeReviewSite {
    id: string;
    name: string;
    href: string;
    /** Who asked, while nobody has answered; else null. */
    requestedBy: string | null;
    requestedAt: string | null;
    openNotes: number;
    /** Up to five visible pages, home first. */
    pages: HomeReviewPage[];
    pageCount: number;
    subdomain: string | null;
    live: boolean;
}

export interface HomeModel {
    /** Absent from an API before F9, which is the business's Home. */
    view: HomeView;
    /** A staff member's narrowing (F11); null on any other Home. */
    staff: HomeStaff | null;
    /** A Reviewer's sites (F9); only on `view: "reviewer"`. */
    reviews?: HomeReviewSite[];
    /** The ranked actions; the rail's badges read the OVERDUE ones. */
    actions: HomeAction[];
    hasAnyModule: boolean;
    /** The next confirmed bookings; Needs you's "Next" line reads them. */
    upcoming: HomeBooking[];
    /** Empty on a healthy read; non-empty means what is shown is incomplete. */
    unavailable: HomeUnavailable[];
    /** Needs you, flat and ranked (F3). */
    needs: HomeNeed[];
    /** How many things need doing; a "3 more" row counts as three. */
    needsTotal: number;
    /** Today (F5); null when the viewer reads none of it, or it failed. */
    today: HomeToday | null;
    /** The header (F6); null from an API that predates it. */
    lastDay: HomeLastDay | null;
    /** This week (F7); null when none of it may be read, it failed, or from an older API. */
    week: HomeWeek | null;
}

const EMPTY: HomeModel = {
    view: "business",
    staff: null,
    actions: [],
    hasAnyModule: false,
    upcoming: [],
    unavailable: [],
    needs: [],
    needsTotal: 0,
    today: null,
    lastDay: null,
    week: null,
};

/**
 * Home's read model, once per request (H-4). The app shell reads it on every
 * page for the rail's badges, and Home's page reads it again for itself;
 * `cache()` makes the two one `GET /home` in the same render. A failed read
 * is cached as the rejection, which each caller handles as it did.
 */
export const getHome = cache(readHome);

async function readHome(projectId?: string): Promise<HomeModel> {
    const base = await orgBase();
    if (!base) return EMPTY;
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    const res = await apiFetch(`${base}/home${qs}`);
    if (!res.ok) {
        throw new Error(`GET home failed: ${res.status}`);
    }
    const read = (await res.json()) as HomeModel;
    // An API from before F5 sends no `today`: no column, not an empty day.
    // One from before F6 sends no `lastDay`: a plain greeting, no strip.
    // One from before F9 sends no `view`: it is the business's Home.
    // One from before F7 sends no `week` (nor does a Reviewer's): no panel.
    // One from before F11 sends a staff member the business's view.
    const model: HomeModel = {
        ...read,
        view:
            read.view === "reviewer" || read.view === "staff"
                ? read.view
                : "business",
        staff: read.view === "staff" ? (read.staff ?? null) : null,
        today: read.today ?? null,
        lastDay: read.lastDay ?? null,
        week: read.week ?? null,
    };
    // An API from before F3 sends no `needs`. Say the list couldn't be read,
    // never "Nothing needs you", while the two deploys cross.
    if (!Array.isArray(model.needs)) {
        return {
            ...model,
            needs: [],
            needsTotal: 0,
            unavailable: [
                ...model.unavailable,
                { moduleKey: "HOME", label: "What needs you" },
            ],
        };
    }
    return model;
}
