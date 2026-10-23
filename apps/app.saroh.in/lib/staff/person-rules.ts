import { count } from "@/lib/format/plural";
import {
    aheadLabel,
    gapLabel,
    latestLabel,
    ruleRows,
} from "@/lib/services/availability-rules";

import type {
    BookingRules,
    PersonRules,
    RuleChanges,
    RuleRequest,
} from "./types";

/**
 * Each person's own booking rules as Hours and time off says them (U20,
 * DEC-170, #1038): the three timing rules in the boards' order, the
 * sentence for a value, the choices a rule's sheet offers ("Same as the
 * business" first), and the lines the waiting, turned-down and request
 * states read. Paying, refunds and free cancelling stay business-wide and
 * are never here: free cancelling follows the business's refund policy
 * (owner, 20 Oct 2026).
 *
 * A null is "same as the business". A person's 0 is a rule of its own:
 * up to the start, or no gap.
 */

export type PersonRuleKey = keyof PersonRules;

/** The three, in the order the boards list them. */
export const PERSON_RULE_KEYS: readonly PersonRuleKey[] = [
    "latestBookingMinutes",
    "bookAheadDays",
    "gapMinutes",
];

const LABEL: Record<PersonRuleKey, string> = {
    latestBookingMinutes: "Booking late",
    bookAheadDays: "Booking ahead",
    gapMinutes: "Gap between bookings",
};

/** The choices a person's rule offers, besides "Same as the business". */
const CHOICES: Record<PersonRuleKey, readonly number[]> = {
    latestBookingMinutes: [60, 120, 720, 1440],
    bookAheadDays: [14, 28, 56, 90],
    gapMinutes: [0, 10, 15, 30],
};

export const SAME_AS_BUSINESS: PersonRules = {
    bookAheadDays: null,
    latestBookingMinutes: null,
    gapMinutes: null,
};

export function ruleLabel(key: PersonRuleKey): string {
    return LABEL[key];
}

/** "8 weeks", "3 months": how far ahead, in the words a person uses. */
function aheadWords(days: number): string {
    return days >= 60 && days % 30 === 0
        ? count(days / 30, "month", "months")
        : aheadLabel(days);
}

/** A person's own value said whole: "Up to 12 hours before the start". */
export function personSentence(key: PersonRuleKey, value: number): string {
    switch (key) {
        case "latestBookingMinutes":
            return value === 0
                ? "Up to the start time"
                : `Up to ${latestLabel(value)} the start`;
        case "bookAheadDays":
            return `Up to ${aheadWords(value)} ahead`;
        case "gapMinutes":
            return gapLabel(value);
    }
}

/** The business's rule for `key`, said as its own Booking rules say it. */
export function businessSentence(
    key: PersonRuleKey,
    business: BookingRules,
): string {
    const rules = { ...business, gapMinutes: business.gapMinutes ?? 0 };
    return ruleRows(rules).find((r) => r.key === key)?.sentence ?? "";
}

/** What a person's diary keeps for `key`: theirs, else the business's. */
export function keptSentence(
    key: PersonRuleKey,
    own: PersonRules,
    business: BookingRules,
): string {
    const value = own[key];
    return value === null
        ? businessSentence(key, business)
        : personSentence(key, value);
}

/** Their own rules, with "same as the business" for an API without them. */
export function ownRules(rules: PersonRules | undefined): PersonRules {
    return rules ?? SAME_AS_BUSINESS;
}

/** How many of a person's rules are their own. */
export function ownCount(own: PersonRules): number {
    return PERSON_RULE_KEYS.filter((k) => own[k] !== null).length;
}

/**
 * The row under "Booking rules for ‹person›": "Same as the business", or
 * "1 rule just for Meera" with how the rest stand under it.
 */
export function rulesSummary(
    own: PersonRules,
    name: string,
): { title: string; sub: string } {
    const n = ownCount(own);
    if (!n) {
        return {
            title: "Same as the business",
            sub: "Notice, booking ahead and gaps",
        };
    }
    return {
        title: `${count(n, "rule", "rules")} just for ${name}`,
        sub:
            n === PERSON_RULE_KEYS.length
                ? "Notice, booking ahead and gaps"
                : "The rest are the same as the business",
    };
}

/** One row of a person's rules, as their sheet lists it. */
export interface PersonRuleRow {
    key: PersonRuleKey;
    label: string;
    sentence: string;
    /** Their own (`Just for Meera`), or the business's. */
    own: boolean;
}

export function personRuleRows(
    own: PersonRules,
    business: BookingRules,
): PersonRuleRow[] {
    return PERSON_RULE_KEYS.map((key) => ({
        key,
        label: LABEL[key],
        sentence: keptSentence(key, own, business),
        own: own[key] !== null,
    }));
}

/** "Same as the business" travels as this in a radio group. */
export const SAME = "same";

/** A choice in one rule's sheet. */
export interface PersonChoice {
    /** `SAME`, or the value as a string. */
    value: string;
    label: string;
    note: string;
}

/**
 * One rule's choices: "Same as the business" first, with the business's
 * rule under it, then the person's own choices, leaving out the one the
 * business already has, and keeping theirs if it is none of them.
 */
export function personChoices(
    key: PersonRuleKey,
    own: PersonRules,
    business: BookingRules,
    name: string,
): PersonChoice[] {
    const biz = businessSentence(key, business);
    const values = [...CHOICES[key]];
    const mine = own[key];
    if (mine !== null && !values.includes(mine)) values.push(mine);
    return [
        { value: SAME, label: "Same as the business", note: biz },
        ...values
            .filter((v) => v === mine || personSentence(key, v) !== biz)
            .map((v) => ({
                value: String(v),
                label: personSentence(key, v),
                note: `Just for ${name}`,
            })),
    ];
}

/** A choice's value back as the rule: null is "same as the business". */
export function choiceValue(value: string): number | null {
    return value === SAME ? null : Number(value);
}

const lowerFirst = (words: string) =>
    words.charAt(0).toLowerCase() + words.slice(1);

/** The toast once a rule is saved: "Booking late for Meera: up to 2 hours before the start. Saved." */
export function personRuleSaved(
    key: PersonRuleKey,
    value: number | null,
    name: string,
): string {
    const words =
        value === null
            ? "same as the business"
            : lowerFirst(personSentence(key, value));
    return `${LABEL[key]} for ${name}: ${words}. Saved.`;
}

/** The fields a request asks to change, in the boards' order. */
export function changedKeys(changes: RuleChanges): PersonRuleKey[] {
    return PERSON_RULE_KEYS.filter((k) => changes[k] !== undefined);
}

/** One asked change, as a phrase in a sentence: "booking late up to 12 hours before the start". */
function askedPhrase(key: PersonRuleKey, value: number | null): string {
    if (value === null) {
        return `${lowerFirst(LABEL[key])} the same as the business`;
    }
    const sentence = lowerFirst(personSentence(key, value));
    if (key === "latestBookingMinutes") return `booking late ${sentence}`;
    if (key === "bookAheadDays") return `booking ${sentence}`;
    return sentence;
}

/** Everything a request asks, joined: "booking late up to 12 hours before the start". */
export function askedWords(changes: RuleChanges): string {
    const parts = changedKeys(changes).map((k) =>
        askedPhrase(k, changes[k] ?? null),
    );
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The owner's line over the page: "Arjun wants their own rule: booking
 * late up to 12 hours before the start." — or, with several waiting,
 * who they are from.
 */
export function requestLine(
    requests: RuleRequest[],
    nameOf: (request: RuleRequest) => string,
): string {
    const first = requests.at(0);
    if (!first) return "";
    if (requests.length === 1) {
        const n = changedKeys(first.changes).length;
        return `${nameOf(first)} wants ${n > 1 ? "their own rules" : "their own rule"}: ${askedWords(first.changes)}.`;
    }
    const names = Array.from(new Set(requests.map(nameOf)));
    const who =
        names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return `${who} want changes to their own rules.`;
}

/**
 * The Member's waiting line: "Booking late: up to 12 hours before the
 * start. Now: up to 2 hours before the start, the same as the business."
 */
export function waitingLine(
    changes: RuleChanges,
    own: PersonRules,
    business: BookingRules,
): string {
    return changedKeys(changes)
        .map((key) => {
            const asked = changes[key] ?? null;
            const now = own[key];
            const askedSaid =
                asked === null
                    ? "same as the business"
                    : lowerFirst(personSentence(key, asked));
            const nowSaid =
                now === null
                    ? `${lowerFirst(businessSentence(key, business))}, the same as the business`
                    : lowerFirst(personSentence(key, now));
            return `${LABEL[key]}: ${askedSaid}. Now: ${nowSaid}.`;
        })
        .join(" ");
}

/**
 * The turned-down line: "Booking late up to 12 hours before the start.
 * Your rule stays the same as the business."
 */
export function turnedDownLine(changes: RuleChanges, own: PersonRules): string {
    const keys = changedKeys(changes);
    const asked = askedWords(changes);
    const same = keys.every((k) => own[k] === null);
    const stays =
        keys.length > 1
            ? same
                ? "Your rules stay the same as the business."
                : "Your rules stay as they were."
            : same
              ? "Your rule stays the same as the business."
              : "Your rule stays as it was.";
    return `${asked.charAt(0).toUpperCase()}${asked.slice(1)}. ${stays}`;
}

/**
 * The line of a request closed by a newer change (owner, 20 Oct 2026):
 * "Booking late up to 12 hours before the start wasn't applied. The rules
 * below are the ones in force."
 */
export function replacedLine(changes: RuleChanges): string {
    const asked = askedWords(changes);
    const what = asked
        ? `${asked.charAt(0).toUpperCase()}${asked.slice(1)} wasn't applied.`
        : "Nothing in it was applied.";
    return `${what} The rules below are the ones in force.`;
}

/** What an approval does, said of the person: "Arjun's bookings now need 12 hours' notice". */
export function nowWords(
    key: PersonRuleKey,
    value: number | null,
    name: string,
): string {
    if (value === null) {
        return `${name}'s ${lowerFirst(LABEL[key])} is now the same as the business`;
    }
    switch (key) {
        case "latestBookingMinutes":
            return value === 0
                ? `${name} can now be booked up to the start`
                : `${name}'s bookings now need ${notice(value)}`;
        case "bookAheadDays":
            return `${name} can now be booked up to ${aheadWords(value)} ahead`;
        case "gapMinutes":
            return value === 0
                ? `${name}'s bookings now need no gap between them`
                : `${name}'s bookings now keep ${value} min between them`;
    }
}

/** "12 hours' notice", "1 day's notice". */
function notice(minutes: number): string {
    const words = latestLabel(minutes).replace(/ before$/, "");
    return words.startsWith("1 ") ? `${words}'s notice` : `${words}' notice`;
}

/**
 * What approving would do, for the review: "If you approve, customers
 * can't book Arjun with less than 12 hours' notice."
 */
export function ifApproved(changes: RuleChanges, name: string): string {
    const keys = changedKeys(changes);
    if (keys.length !== 1) {
        return `If you approve, these apply to ${name}'s bookings from now on.`;
    }
    const key = keys[0];
    const value = changes[key] ?? null;
    if (value === null) {
        return `If you approve, ${name}'s ${lowerFirst(LABEL[key])} goes back to the business's.`;
    }
    switch (key) {
        case "latestBookingMinutes":
            return value === 0
                ? `If you approve, customers can book ${name} up to the start.`
                : `If you approve, customers can't book ${name} with less than ${notice(value)}.`;
        case "bookAheadDays":
            return `If you approve, customers can book ${name} up to ${aheadWords(value)} ahead.`;
        case "gapMinutes":
            return value === 0
                ? `If you approve, ${name}'s bookings need no gap between them.`
                : `If you approve, ${name}'s bookings keep ${value} min between them.`;
    }
}
