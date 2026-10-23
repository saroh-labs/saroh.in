import type { Prisma } from "@saroh/database";

import type {
    PersonRuleField,
    PersonRules,
    RuleChanges,
} from "../bookings/person-rules";
import {
    personRulesOf,
    ruleWords,
    storedRuleChanges,
} from "../bookings/person-rules";
import { resolveCapabilities } from "../organizations/organization-policy";
import { cleanBusinessName } from "../site-accounts/sender-name";
import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * Permission requests to the people who may answer them, and the answers
 * back (DEC-170, owner 19 Oct: "Rule requests are told by email and in the
 * app"). Owners and admins hear of a request in the inbox AND by email;
 * the person who asked hears the outcome — approved, turned down with
 * the reason, or replaced by a newer change (owner, 20 Oct 2026) — in
 * their own alerts AND by email.
 *
 * The mechanism is the request's, not the rules': a request writes its
 * bell notice on its own transaction (the business's, for whoever may
 * answer; the asker's own, `userId`, for the answer) and queues
 * `team.alert` `{ event: "ask", about, step }` beside it; this words the
 * email, and `tellTeam` claims it once and sends it from Saroh to exactly
 * the people named (`emailUserIds`), whatever their alert choices: there
 * is no switch for being asked. A new kind of request adds its `about`
 * and its wording here. Today a Member's own booking rules (#1038) are the
 * only request made to owners and admins; a site's review is asked of its
 * reviewers instead (`review-alerts.ts`).
 *
 * Re-read when it runs: a request withdrawn, replaced or already decided
 * by the time "asked" runs says nothing, and an answer is told only while
 * the request stands answered.
 */

type Tx = Prisma.TransactionClient;
type AskPayload = Extract<TeamAlertPayload, { event: "ask" }>;

/** The bell's notice types (`notice-target.ts`). */
export const RULE_REQUEST_NOTIFICATION_TYPE = "hours.rule-request" as const;
export const RULE_ANSWER_NOTIFICATION_TYPE = "hours.rule-answer" as const;

/**
 * How a request ended, as its asker is told: approved, turned down, or
 * closed by a newer change (`staff/rule-request-close.ts`).
 */
export type AnswerOutcome = "APPROVED" | "TURNED_DOWN" | "REPLACED";

/** How much of a turn-down's reason the email carries. */
export const REASON_MAX = 280;

/**
 * The ask alert, worded; null when it no longer stands. One kind today
 * (`about: "rules"`); a second makes this a switch on `about`.
 */
export async function wordAsk(
    tx: Tx,
    organizationId: string,
    p: AskPayload,
): Promise<WordedAlert | null> {
    return wordRulesAsk(tx, organizationId, p);
}

/** Where a person's rules are reviewed: Hours and time off, on them. */
export function hoursPath(staffId: string): string {
    return `/bookings/availability?person=${encodeURIComponent(staffId)}`;
}

/**
 * The asked rules, and the person's own as they stand, in the boards'
 * words: "Booking late: up to 2 hours before the start".
 */
export function askedAndNow(
    asked: RuleChanges,
    now: PersonRules,
): { asked: string[]; now: string[] } {
    const fields = ORDER.filter((field) => asked[field] !== undefined);
    return {
        asked: fields.map((field) => ruleWords(field, asked[field] ?? null)),
        now: fields.map((field) => ruleWords(field, now[field])),
    };
}

/** The boards' order (`changesWords`). */
const ORDER = [
    "latestBookingMinutes",
    "bookAheadDays",
    "gapMinutes",
] as const satisfies readonly PersonRuleField[];

/** Words joined as one plain sentence's list. */
function listed(words: readonly string[]): string {
    return words.join("; ");
}

/**
 * The email to whoever may approve: who asked, what they asked for, and
 * what their rules are now. `who` is already cleaned.
 */
export function askedMail(
    who: string,
    words: { asked: string[]; now: string[] },
): WordedAlert["mail"] {
    return {
        heading: `${who} asked to change their booking rules`,
        body: `They asked for: ${listed(words.asked)}. Now: ${listed(words.now)}. Approve it or turn it down in Hours and time off.`,
    };
}

/**
 * The email to whoever asked: approved, turned down with the reason
 * (already cleaned; null when none was given), or replaced by a newer
 * change.
 */
export function answeredMail(
    outcome: AnswerOutcome,
    asked: readonly string[],
    reason: string | null,
): WordedAlert["mail"] {
    if (outcome === "REPLACED") {
        return {
            heading: answerTitle(outcome),
            body: `You asked for: ${listed(asked)}. A newer change closed it before anyone decided, so nothing in it was applied. See your booking rules as they are now, and change them again if you still need to.`,
        };
    }
    if (outcome === "APPROVED") {
        return {
            heading: "Your booking rules change was approved",
            body: `Your booking rules now say: ${listed(asked)}.`,
        };
    }
    return {
        heading: "Your booking rules change was turned down",
        body: `You asked for: ${listed(asked)}. Nothing has changed. ${
            reason ? `The reason given: “${reason}”` : "No reason was given."
        }`,
    };
}

/**
 * A turn-down's reason as Saroh's email may carry it: typed by an owner or
 * admin of the business, not a customer, so it goes — but with no links,
 * addresses or domains, no control characters, and at most
 * {@link REASON_MAX} characters. Null when nothing is left.
 */
export function cleanReason(reason: string | null | undefined): string | null {
    const cleaned = (reason ?? "")
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
        .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/giu, " ")
        .replace(/\S+@\S+/gu, " ")
        .replace(/\b(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}\b\.?/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
    if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;
    const chars = Array.from(cleaned);
    if (chars.length <= REASON_MAX) return cleaned;
    return `${chars
        .slice(0, REASON_MAX - 1)
        .join("")
        .trim()}…`;
}

async function wordRulesAsk(
    tx: Tx,
    organizationId: string,
    p: AskPayload,
): Promise<WordedAlert | null> {
    const request = await tx.staffRuleRequest.findFirst({
        where: { id: p.requestId, organizationId },
        select: {
            id: true,
            status: true,
            changes: true,
            reason: true,
            requestedByUserId: true,
            staff: {
                select: {
                    id: true,
                    name: true,
                    bookAheadDays: true,
                    latestBookingMinutes: true,
                    gapMinutes: true,
                },
            },
        },
    });
    if (!request) return null;
    const asked = storedRuleChanges(request.changes);
    const base = {
        event: "ask" as const,
        notificationId: p.notificationId,
        path: hoursPath(request.staff.id),
        skipUserId: null,
    };

    if (p.step === "asked") {
        // Withdrawn, replaced or decided since: nothing left to ask.
        if (request.status !== "WAITING") return null;
        const who = cleanBusinessName(
            request.staff.name,
            "Someone on your team",
        );
        const words = askedAndNow(asked, personRulesOf(request.staff));
        return {
            ...base,
            eventKey: `team:ask:rules:${request.id}:asked`,
            ...noticeOf(RULE_REQUEST_NOTIFICATION_TYPE, {
                staffId: request.staff.id,
            }),
            title: `${request.staff.name} asked to change their booking rules`,
            body: words.asked.join(" · "),
            mail: askedMail(who, words),
            cta: "Review the request",
            emailUserIds: (await whoMayApprove(tx, organizationId)).filter(
                (userId) => userId !== request.requestedByUserId,
            ),
            footer: "You get this because you can approve changes to booking rules at {business}.",
        };
    }

    if (
        request.status !== "APPROVED" &&
        request.status !== "TURNED_DOWN" &&
        request.status !== "REPLACED"
    ) {
        return null;
    }
    const words = askedAndNow(asked, personRulesOf(request.staff)).asked;
    return {
        ...base,
        eventKey: `team:ask:rules:${request.id}:answered`,
        ...noticeOf(RULE_ANSWER_NOTIFICATION_TYPE, {
            staffId: request.staff.id,
        }),
        title: answerTitle(request.status),
        body: words.join(" · "),
        mail: answeredMail(request.status, words, cleanReason(request.reason)),
        cta: "Open your hours and time off",
        emailUserIds: [request.requestedByUserId],
        footer: "You get this because you asked to change your booking rules at {business}.",
    };
}

/** The answer's title, in the asker's inbox and email alike. */
export function answerTitle(status: AnswerOutcome): string {
    switch (status) {
        case "APPROVED":
            return "Your booking rules change was approved";
        case "TURNED_DOWN":
            return "Your booking rules change was turned down";
        case "REPLACED":
            return "Your booking rules change was replaced by a newer change";
    }
}

/**
 * Everyone on the team who may approve a rules request: whose role, with
 * their own extras, holds `service:write` (built in, the owners and
 * admins). Ordered by user, so the emails go in a stable order.
 */
async function whoMayApprove(
    tx: Tx,
    organizationId: string,
): Promise<string[]> {
    const [members, roles] = await Promise.all([
        tx.membership.findMany({
            where: { organizationId },
            select: { userId: true, role: true, extraActions: true },
            orderBy: { userId: "asc" },
        }),
        tx.organizationRole.findMany({
            where: { organizationId },
            select: { key: true, actions: true },
        }),
    ]);
    return members
        .filter((m) =>
            resolveCapabilities(
                m.role,
                roles.find((r) => r.key === m.role)?.actions ?? null,
                m.extraActions,
            ).has("service:write"),
        )
        .map((m) => m.userId);
}
