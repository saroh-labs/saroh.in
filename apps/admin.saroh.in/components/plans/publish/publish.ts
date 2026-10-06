import { formatDate } from "@/lib/format";
import type { PublishPolicy, PublishResult } from "@/lib/pricing-types";

/**
 * The publish panel's rules (plans catalogue U10), pure: when a go-live date
 * is allowed, what the button says, and what the toast says after.
 */

/** The API refuses a go-live more than this far ahead. */
export const MAX_SCHEDULE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export type When = "now" | "date";

/** Midnight at the start of tomorrow, in the operator's time. */
export function tomorrowStart(now: Date): Date {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
}

/** The go-live a picked day means: the start of that day, operator's time. */
export function goLiveOf(day: Date): Date {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Why the picked date can't be used, or null when it can. */
export function dateProblem(
    when: When,
    day: Date | null,
    now: Date,
): string | null {
    if (when === "now") return null;
    if (!day || goLiveOf(day).getTime() < tomorrowStart(now).getTime()) {
        return "Pick a date from tomorrow on";
    }
    if (goLiveOf(day).getTime() > now.getTime() + MAX_SCHEDULE_DAYS * DAY_MS) {
        return "Pick a date within a year";
    }
    return null;
}

/**
 * The publish button's label: what is missing, else what it will do. The
 * design's order: the policy first, then the date.
 */
export function publishLabel(input: {
    nextV: number;
    when: When;
    policy: PublishPolicy | null;
    dateProblem: string | null;
    /** What else stops it, in words (an invalid or unchanged draft). */
    blocked: string | null;
}): { label: string; ready: boolean } {
    if (input.blocked) return { label: input.blocked, ready: false };
    if (!input.policy) {
        return {
            label: "Choose what happens to existing businesses",
            ready: false,
        };
    }
    if (input.dateProblem) return { label: input.dateProblem, ready: false };
    return input.when === "date"
        ? { label: `Schedule version ${input.nextV}`, ready: true }
        : { label: `Publish version ${input.nextV} now`, ready: true };
}

/** The toast after a publish, by what the API says happened. */
export function publishedMessage(r: PublishResult): string {
    if (r.status === "scheduled") {
        return `Version ${r.version} goes live on ${formatDate(r.goLiveAt)}`;
    }
    if (r.status === "waiting") {
        return `Version ${r.version} is waiting for billing`;
    }
    return `Version ${r.version} is live on the pricing page`;
}

/** A refusal's words, with the draft's own errors when the API lists them. */
export function refusalText(error: string, details: unknown): string {
    const errors =
        details && typeof details === "object"
            ? (details as { errors?: unknown }).errors
            : undefined;
    if (Array.isArray(errors) && errors.length > 0) {
        return `${error} ${errors.filter((e) => typeof e === "string").join(" · ")}`;
    }
    return error;
}
