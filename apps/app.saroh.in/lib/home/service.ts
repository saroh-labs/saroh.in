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

/** What an inline action will do (F4); F3's rows carry none yet. */
export interface HomeInline {
    kind: "MARK_SENT" | "RETRY" | "SEND_REMINDER" | "REPLY";
    label: string;
    confirm: string;
    undoable: boolean;
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

/** A count whose `href` lands on exactly the rows it counts. */
export interface HomeNumber {
    key: string;
    label: string;
    value: number;
    href: string;
    moduleKey?: string;
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

export interface HomeModel {
    actions: HomeAction[];
    primaryAction: HomeAction | null;
    hasAnyModule: boolean;
    upcoming: HomeBooking[];
    numbers: HomeNumber[];
    /** Empty on a healthy read; non-empty means what is shown is incomplete. */
    unavailable: HomeUnavailable[];
    /** Needs you, flat and ranked (F3). `actions` stays for one release. */
    needs: HomeNeed[];
    /** How many things need doing; a "3 more" row counts as three. */
    needsTotal: number;
    /** Today (F5); null when the viewer reads none of it, or it failed. */
    today: HomeToday | null;
    /** The header (F6); null from an API that predates it. */
    lastDay: HomeLastDay | null;
}

const EMPTY: HomeModel = {
    actions: [],
    primaryAction: null,
    hasAnyModule: false,
    upcoming: [],
    numbers: [],
    unavailable: [],
    needs: [],
    needsTotal: 0,
    today: null,
    lastDay: null,
};

export async function getHome(projectId?: string): Promise<HomeModel> {
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
    const model: HomeModel = {
        ...read,
        today: read.today ?? null,
        lastDay: read.lastDay ?? null,
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
