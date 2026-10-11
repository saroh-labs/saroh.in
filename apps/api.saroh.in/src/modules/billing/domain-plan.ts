/**
 * A business's own domain when its plan stops including one (DEC-139).
 *
 * The domain is paused, never removed. The business is told before the plan
 * ends; for 3 days after the end the domain still shows the site; then it
 * stops showing it and sends a visitor on to the business's Saroh address.
 * The connection is kept (its DNS check, its certificate, its record with
 * the host), so a plan with a domain again shows the site again at once.
 *
 * **Derived, never stored on the domain.** Nothing marks a `Domain` row
 * paused: every read asks {@link domainPlanState} with what the business's
 * plan reads now, so a move back up needs no job to put anything back. The
 * one stored thing is the clock, as for everything else a move down pauses
 * (`over-limit.ts`): a `CustomerNotice` of kind {@link DOMAIN_ENDED_KIND}
 * dated when the plan stopped including a domain, written by the hourly
 * billing sweep (`domain-plan-notice.ts`).
 *
 * Only behind `PLAN_ENFORCEMENT`, as every plan rule: with it off the state
 * is always `included`, and nothing changes anywhere.
 *
 * Pure: `DomainPlanService` reads the facts, this decides.
 */

/** The entitlement that says a plan includes the business's own domain. */
export const DOMAIN_ENTITLEMENT = "customDomain";

/** How long the domain still shows the site after the plan ends. */
export const DOMAIN_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The clock: when the plan stopped including a domain (`CustomerNotice.kind`). */
export const DOMAIN_ENDED_KIND = "DOMAIN_PLAN_ENDED";
/** One clock per business. */
export const DOMAIN_ENDED_KEY = "domain-plan-ended";

/** A plan end the business was told about ahead (`CustomerNotice.kind`). */
export const DOMAIN_TOLD_KIND = "DOMAIN_ENDING";

/** The "now paused" notice, once per clock (`CustomerNotice.kind`). */
export const DOMAIN_PAUSED_KIND = "DOMAIN_PAUSED";

/** Where a business's domain stands against its plan. */
export type DomainPlanState =
    /** The plan includes a domain, or nothing is enforced. */
    | { state: "included" }
    /** The plan still includes one, and is known to end at `endsAt`. */
    | { state: "ending"; endsAt: Date; stopsAt: Date }
    /** The plan no longer includes one; the domain shows the site until `stopsAt`. */
    | { state: "grace"; endedAt: Date; stopsAt: Date }
    /** The domain sends visitors to the Saroh address, since `since`. */
    | { state: "paused"; since: Date };

/** When a domain stops showing the site: 3 days after its plan ended. */
export function domainStopsAt(planEnd: Date): Date {
    return new Date(planEnd.getTime() + DOMAIN_GRACE_DAYS * DAY_MS);
}

/**
 * The one rule. `endsAt` is a plan end known ahead (an offer's end, a
 * term's end, a chosen move), read only while the plan still includes a
 * domain. `endedAt` is the stored clock, read only once it doesn't; while
 * the sweep hasn't written it yet (within the hour of the end) the 3 days
 * count from now, so a domain is never paused before its business has a
 * clock.
 *
 * The boundaries: at the plan's end the plan no longer includes a domain,
 * so the state is `grace`; at exactly 3 days on it is `paused`.
 */
export function domainPlanState(input: {
    /** `PLAN_ENFORCEMENT` for this business. */
    enforced: boolean;
    /** The plan it reads now includes its own domain. */
    includedNow: boolean;
    endsAt: Date | null;
    endedAt: Date | null;
    now: Date;
}): DomainPlanState {
    const { now } = input;
    if (!input.enforced) return { state: "included" };
    if (input.includedNow) {
        const end = input.endsAt;
        return end && end.getTime() > now.getTime()
            ? { state: "ending", endsAt: end, stopsAt: domainStopsAt(end) }
            : { state: "included" };
    }
    // A clock dated ahead of now can't be right: count from now.
    const endedAt =
        input.endedAt && input.endedAt.getTime() <= now.getTime()
            ? input.endedAt
            : now;
    const stopsAt = domainStopsAt(endedAt);
    return stopsAt.getTime() <= now.getTime()
        ? { state: "paused", since: stopsAt }
        : { state: "grace", endedAt, stopsAt };
}

/** A domain's standing against the plan, as the workspace reads it. */
export interface DomainPlanView {
    state: DomainPlanState["state"];
    /**
     * The day the domain stops showing the site (`ending`, `grace`), or
     * stopped (`paused`), ISO. Null while the plan includes it.
     */
    stopsAt: string | null;
    /**
     * Where its visitors are sent while paused, as a host
     * ("yourshop.saroh.app"). Null when the domain serves no website yet.
     */
    sendsTo: string | null;
}

/** {@link DomainPlanView} for one domain. */
export function domainPlanView(
    plan: DomainPlanState,
    sendsTo: string | null,
): DomainPlanView {
    const stopsAt =
        plan.state === "included"
            ? null
            : plan.state === "paused"
              ? plan.since
              : plan.stopsAt;
    return {
        state: plan.state,
        stopsAt: stopsAt?.toISOString() ?? null,
        sendsTo,
    };
}

/** The claim that an end at `endsAt` was told ahead, at one notice stage. */
export function domainToldKey(endsAt: Date, stage: number): string {
    return `domain-ending:${endsAt.toISOString()}:${stage}`;
}

/** The end a told claim was written for; null when the key isn't one. */
export function toldEndOf(eventKey: string): Date | null {
    const m = /^domain-ending:(.+):\d+$/.exec(eventKey);
    if (!m?.[1]) return null;
    const at = new Date(m[1]);
    return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * When the clock starts for a plan that has just stopped including a
 * domain: the end the business was told about ahead, when one has passed
 * (so the day it was told is the day that is kept), else now.
 */
export function clockStart(toldKeys: readonly string[], now: Date): Date {
    let start: Date | null = null;
    for (const key of toldKeys) {
        const end = toldEndOf(key);
        if (!end || end.getTime() > now.getTime()) continue;
        if (!start || end.getTime() > start.getTime()) start = end;
    }
    return start ?? now;
}

/** The "now paused" claim for one clock. */
export function domainPausedKey(endedAt: Date): string {
    return `domain-paused:${endedAt.toISOString()}`;
}

/** What a notice says about the domain. */
export interface DomainWords {
    /** The business's connected domains, oldest first. Never empty. */
    hostnames: string[];
    /** The day they stop showing the site ("18 Nov 2026"). */
    stopsOn: string;
    /** Where visitors are sent then ("yourshop.saroh.app"); null if unknown. */
    address: string | null;
}

function list(names: readonly string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function sentTo(address: string | null): string {
    return address ?? "your Saroh address";
}

/** How the domain comes back, the same in every notice. */
export const DOMAIN_COMES_BACK =
    "Your domain stays connected. It shows your site again as soon as you're on a plan with your own domain, with nothing to set up again.";

/**
 * The line a notice of a plan's end adds for the domain: the named day,
 * where visitors go after it, and that nothing is disconnected.
 */
export function domainEndingLine(w: DomainWords): string {
    const many = w.hostnames.length > 1;
    return `${list(w.hostnames)} ${many ? "stop" : "stops"} showing your site on ${w.stopsOn}, ${DOMAIN_GRACE_DAYS} days after your plan ends. After that, visitors are sent to ${sentTo(w.address)}. ${DOMAIN_COMES_BACK}`;
}

/** The same, for a plan that has already ended. */
export function domainEndedLine(w: DomainWords): string {
    const many = w.hostnames.length > 1;
    return `Your plan no longer includes your own domain. ${list(w.hostnames)} ${many ? "show" : "shows"} your site until ${w.stopsOn}. After that, visitors are sent to ${sentTo(w.address)}. ${DOMAIN_COMES_BACK}`;
}

/** The same, once the 3 days are up. */
export function domainPausedLine(
    w: Pick<DomainWords, "hostnames" | "address">,
): string {
    const many = w.hostnames.length > 1;
    return `${list(w.hostnames)} ${many ? "are" : "is"} paused: your plan doesn't include your own domain, so visitors are sent to ${sentTo(w.address)}. ${DOMAIN_COMES_BACK}`;
}

/** The inbox notice (`plan.ending`) for each of the domain's own notices. */
export function domainNotice(
    mode: "ending" | "ended" | "paused",
    w: DomainWords,
): { title: string; body: string } {
    const many = w.hostnames.length > 1;
    const what = many ? "Your domains" : "Your domain";
    if (mode === "paused") {
        return {
            title: `${what} ${many ? "are" : "is"} paused`,
            body: domainPausedLine(w),
        };
    }
    return {
        title: `${what} ${many ? "stop" : "stops"} showing your site on ${w.stopsOn}`,
        body: mode === "ending" ? domainEndingLine(w) : domainEndedLine(w),
    };
}
