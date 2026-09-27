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
    /** What happened, in a few words: "Overdue 2 days", "Payment failed". */
    tag?: string;
    tone?: HomeTone;
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
 * A count that is a destination.
 *
 * Every number on Home links to the exact rows it counts — `href` carries the
 * filter, not just the screen. A tile that states "12 open leads" and lands on
 * an unfiltered list has made the merchant do the filtering twice.
 */
export interface HomeNumber {
    key: string;
    label: string;
    value: number;
    href: string;
    moduleKey?: string;
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

export interface HomeModel {
    actions: HomeAction[];
    primaryAction: HomeAction | null;
    hasAnyModule: boolean;
    /** Confirmed bookings from now forward; the client groups them by day. */
    upcoming: HomeBooking[];
    numbers: HomeNumber[];
    /**
     * Sources that failed. Empty on a healthy read. Non-empty means what is
     * shown is INCOMPLETE, and Home must say so rather than presenting the
     * subset as the whole picture (§30).
     */
    unavailable: HomeUnavailable[];
}

export interface HomeInput {
    organizationId: string;
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
 * "Overdue 2 days": whole days since `dueAt`, and never "0 days" — something
 * past due by an hour is already overdue, so it reads "Overdue 1 day".
 */
export function overdueTag(dueAt: Date, now: Date): string {
    const days = Math.max(
        1,
        Math.floor((now.getTime() - dueAt.getTime()) / DAY_MS),
    );
    return `Overdue ${days} day${days === 1 ? "" : "s"}`;
}
