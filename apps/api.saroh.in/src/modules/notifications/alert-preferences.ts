import { isDiaryScoped } from "../bookings/own-diary";
import { isLocationScoped } from "../orders/order-location";
import type { OrgAction } from "../organizations/organization-actions";

/**
 * Alerts: what each person on the team hears about, and where (round-2 F14,
 * R13). "What you hear about" in Settings › Your profile.
 *
 * Pure: the rows, the channels, the defaults, which reads each row needs,
 * and which inbox notices each row covers. The service reads and writes the
 * person's own choices (`notification-preferences.service.ts`); the senders
 * ask {@link alertOn} (`team-alert.handler.ts`); the inbox hides what a
 * person turned the bell off for (`notifications.service.ts`).
 *
 * The design's fifth row, the Monday summary, is left out: nothing sends
 * it this round, and a switch that does nothing is a promise Saroh doesn't
 * keep (default 127, changed 2026-09-27). It comes back with its sender.
 */

/** The alerts, in the design's order. */
export const ALERT_EVENTS = [
    "order",
    "booking",
    "failed",
    "team",
    "site",
] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

/**
 * The channels. There is no SMS: nothing sends one, so none is offered.
 * WhatsApp is listed because the business may connect a WhatsApp provider,
 * but it cannot reach a team member yet (Saroh keeps no number for them),
 * so it is never available — see {@link channelState}.
 */
export const ALERT_CHANNELS = ["bell", "email", "whatsapp"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export function isAlertEvent(value: unknown): value is AlertEvent {
    return (ALERT_EVENTS as readonly unknown[]).includes(value);
}

export function isAlertChannel(value: unknown): value is AlertChannel {
    return (ALERT_CHANNELS as readonly unknown[]).includes(value);
}

/**
 * The defaults (default 126): the bell on for everything, email on for a
 * failed payment and for a scheduled go-live (DEC-071, T10: whoever can
 * publish should hear that the site changed, or didn't, while nobody was
 * watching), WhatsApp off. Code, not rows: a row is written only
 * when someone's choice differs from these.
 */
export function defaultOn(event: AlertEvent, channel: AlertChannel): boolean {
    if (channel === "bell") return true;
    if (channel === "email") return event === "failed" || event === "site";
    return false;
}

/**
 * What a person must be able to read to be offered a row. Any one will do:
 * the kitchen (`order:stage`) sees new orders, and a failed payment is
 * money whether it is read as payments or as invoices.
 */
export const ALERT_READS: Record<AlertEvent, readonly OrgAction[]> = {
    order: ["order:read", "order:stage"],
    booking: ["booking:read"],
    failed: ["payment:read", "invoice:read"],
    team: ["member:read"],
    // Who can put the site live hears when it went live without them.
    site: ["site:publish"],
};

/**
 * The module a row belongs to, when it has one. A module the business
 * hasn't turned on, or that Saroh hasn't rolled out to it, has no row
 * (DEC-057: never name a module that is rolled out off).
 */
export const ALERT_MODULE: Record<AlertEvent, string | null> = {
    order: "COMMERCE",
    booking: "APPOINTMENTS",
    failed: "PAYMENTS",
    team: null,
    site: "WEBSITE",
};

/** The inbox notice types each row covers. */
export const ALERT_NOTIFICATION_TYPES: Record<AlertEvent, readonly string[]> = {
    // R34: an order to pay on handover nobody came for in three days.
    order: ["order.new", "order.uncollected"],
    booking: ["booking.new", "booking.moved", "booking.cancelled"],
    // UX-012: a provider that refused the business's keys.
    failed: ["payment.failed", "provider.attention"],
    team: ["team.joined"],
    // UX-043: a reviewer's verdict, or their first note of a round.
    // #917: a live custom domain that stopped working, and came back.
    site: [
        "site.live",
        "site.not_live",
        "site.review.approved",
        "site.review.changes",
        "site.review.note",
        "domain.down",
        "domain.back",
    ],
};

/** Which row an inbox notice type belongs to, or null (enquiries, reviews). */
export function alertEventOfType(type: string): AlertEvent | null {
    for (const event of ALERT_EVENTS) {
        if (ALERT_NOTIFICATION_TYPES[event].includes(type)) return event;
    }
    return null;
}

/**
 * Whether someone holding `has` may be offered `event`.
 *
 * A location's team (`roleKey`, DEC-074) reads only its own storefronts'
 * orders, and a New order alert goes to the whole business, whichever
 * storefront it came in at — so it isn't offered to them, and their
 * orders reach them on Orders and Home instead. Calendar only (#868)
 * reads only its own diary, and a booking alert names whoever booked with
 * anyone, so the same holds for bookings: theirs reach them on the
 * calendar and Home.
 */
export function mayHearAbout(
    event: AlertEvent,
    has: (action: OrgAction) => boolean,
    roleKey?: string | null,
): boolean {
    if (event === "order" && isLocationScoped(roleKey)) return false;
    if (event === "booking" && isDiaryScoped(roleKey)) return false;
    return ALERT_READS[event].some(has);
}

/** One stored choice. */
export interface StoredPreference {
    event: string;
    channel: string;
    enabled: boolean;
}

/** Whether a person hears about `event` on `channel`: their row, else the default. */
export function alertOn(
    stored: readonly StoredPreference[],
    event: AlertEvent,
    channel: AlertChannel,
): boolean {
    const row = stored.find((p) => p.event === event && p.channel === channel);
    return row ? row.enabled : defaultOn(event, channel);
}

/**
 * Why a channel can't be used, when it can't:
 * - `NO_INBOX`: the person's role doesn't see the bell (`notification:read`).
 * - `NO_PROVIDER`: the business has no connected provider for it (WhatsApp
 *   only: email alerts come from Saroh, whatever the business connected,
 *   DEC-011 amended 2026-10-07).
 * - `NO_NUMBER`: WhatsApp is connected, but Saroh keeps no WhatsApp number
 *   for a team member, so nothing could reach them there.
 */
export type ChannelUnavailable = "NO_INBOX" | "NO_PROVIDER" | "NO_NUMBER";

export type ChannelState =
    { available: true } | { available: false; reason: ChannelUnavailable };

/** What each channel can do for this person, in this business. */
export function channelState(input: {
    channel: AlertChannel;
    seesInbox: boolean;
    whatsappConnected: boolean;
}): ChannelState {
    switch (input.channel) {
        case "bell":
            return input.seesInbox
                ? { available: true }
                : { available: false, reason: "NO_INBOX" };
        case "email":
            // Saroh sends it, so it reaches anyone with a sign-in email.
            return { available: true };
        case "whatsapp":
            return input.whatsappConnected
                ? { available: false, reason: "NO_NUMBER" }
                : { available: false, reason: "NO_PROVIDER" };
    }
}

/**
 * The inbox notice types a person doesn't see: those of every row they
 * turned the bell off for, and of every row their role can't read.
 */
export function hiddenNotificationTypes(
    stored: readonly StoredPreference[],
    has: (action: OrgAction) => boolean,
    roleKey?: string | null,
): string[] {
    return ALERT_EVENTS.filter(
        (event) =>
            !mayHearAbout(event, has, roleKey) ||
            !alertOn(stored, event, "bell"),
    ).flatMap((event) => [...ALERT_NOTIFICATION_TYPES[event]]);
}
