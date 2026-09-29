import type {
    AutopayCancelled,
    AutopayMethod,
    AutopayOffer,
    Subscription,
} from "./service";
import { autopayLine, chargingText, dayText, money } from "./view";

/**
 * Autopay on Subscription Detail for staff (round-2 D14), in words: the
 * line under the plan, how it came to be, what needs attention, and which
 * of "Send a set-up link" and "Cancel autopay" to offer. Pure — every
 * "now" is passed in.
 *
 * With the business not offering autopay (its provider can't, or the
 * rollout flag is off) nothing here offers or promises it: the line is
 * today's "Pays by…" or "Each renewal is invoiced with a pay link". A
 * mandate already made still shows, and can still be cancelled.
 */

export interface AutopayPanel {
    /** "Autopay on · UPI · mo•••@okicici · limit ₹1,500", or how it's paid. */
    line: string;
    /** "Set up by Asha from the pay link · 3 Sep"; null: nothing to add. */
    detail: string | null;
    /** What needs seeing: the limit too low, a charge under way, a cancel being confirmed. */
    notice: { text: string; tone: "warn" | "info" } | null;
    /** "Send a set-up link", "Send a new set-up link"; null: not offered. */
    sendLabel: string | null;
    /** "Cancel autopay" is offered. */
    canCancel: boolean;
}

const FROM: Record<string, string> = {
    PAY_LINK: "from the pay link",
    PRICES: "from the Prices page",
    ACCOUNT: "from their account",
    SETUP_LINK: "from a set-up link",
};

export function autopayPanel(
    sub: Pick<
        Subscription,
        | "status"
        | "autopay"
        | "autopayCard"
        | "autopayCharge"
        | "timezone"
        | "contact"
    >,
    opts: { canWrite: boolean; paysBy: string | null; now: Date },
): AutopayPanel {
    const { now } = opts;
    const tz = sub.timezone;
    const card = sub.autopayCard ?? null;
    const autopay = sub.autopay ?? null;
    const first = sub.contact.name.split(" ")[0] || sub.contact.name;
    const fallback = opts.paysBy
        ? `Pays by ${opts.paysBy}`
        : "Each renewal is invoiced with a pay link";
    const provider = card?.provider ?? "your payment provider";
    const live =
        autopay?.state === "ON" ||
        autopay?.state === "PAUSED" ||
        autopay?.state === "PENDING";

    let line = autopayLine(autopay) ?? fallback;
    let notice: AutopayPanel["notice"] = null;
    if (!autopay && card?.ended) {
        const day = dayText(card.ended.at, tz, now);
        line = card.ended.confirmed
            ? `Autopay cancelled ${day} — renewals are invoiced with a pay link`
            : `Autopay cancelled ${day} — being confirmed with ${provider}`;
        if (!card.ended.confirmed) {
            notice = {
                text: `Nothing more is charged. ${provider} hasn't confirmed the cancel yet — Saroh keeps asking.`,
                tone: "info",
            };
        }
    }

    const limitLow = card?.limitLow ?? null;
    if (limitLow && (autopay?.state === "ON" || autopay?.state === "PAUSED")) {
        notice = {
            text: limitLow.limit
                ? `Autopay limit too low — covers up to ${money(limitLow.limit, limitLow.currency)}, this renewal is ${money(limitLow.amount, limitLow.currency)}`
                : `Autopay limit too low — this renewal of ${money(limitLow.amount, limitLow.currency)} is more than it covers`,
            tone: "warn",
        };
    } else if (sub.autopayCharge) {
        const charging = chargingText(sub, now);
        if (charging) notice = { text: charging, tone: "info" };
    }

    let detail: string | null = null;
    const setUp = card?.setUp ?? null;
    if (autopay && setUp) {
        const day = dayText(setUp.at, tz, now);
        if (autopay.state === "ON" || autopay.state === "PAUSED") {
            const from = setUp.source ? FROM[setUp.source] : undefined;
            const sent =
                setUp.source === "SETUP_LINK" && setUp.sentBy
                    ? ` ${setUp.sentBy} sent`
                    : "";
            detail = from
                ? `Set up by ${first} ${from}${sent} · ${day}`
                : `Set up ${day}`;
        } else if (autopay.state === "PENDING") {
            detail = setUp.sentBy
                ? `Set-up link sent by ${setUp.sentBy} · ${day}`
                : `Started ${day}`;
        }
    }

    const mayAct = opts.canWrite && sub.status !== "CANCELLED";
    let sendLabel: string | null = null;
    if (
        mayAct &&
        card?.offered &&
        card.methods.length > 0 &&
        !sub.autopayCharge
    ) {
        if (limitLow && autopay?.state !== "PENDING") {
            sendLabel = "Send a set-up link";
        } else if (autopay?.state === "PENDING") {
            sendLabel = "Send a new set-up link";
        } else if (!autopay || autopay.state === "FAILED") {
            sendLabel = "Send a set-up link";
        }
    }

    return {
        line,
        detail,
        notice,
        sendLabel,
        canCancel: mayAct && live,
    };
}

/** How the set-up link's picker names a method. */
export const AUTOPAY_METHOD_LABEL: Record<AutopayMethod, string> = {
    UPI: "UPI",
    CARD: "Card",
    EMANDATE: "Bank account (eMandate)",
};

/** The line under each method: its ₹1 check, when it takes one (DEC-064). */
export function methodNote(
    offer: Pick<AutopayOffer, "checks">,
    method: AutopayMethod,
): string {
    const check = offer.checks[method];
    const base: Record<AutopayMethod, string> = {
        UPI: "They approve it in their UPI app",
        CARD: "They approve it with their card",
        EMANDATE: "They approve it with their bank",
    };
    return check
        ? `${base[method]} · a ${money(check.amount, check.currency)} check, refunded straight away`
        : base[method];
}

/** What the toast says after "Cancel autopay" (D14). */
export function cancelledText(res: AutopayCancelled): {
    title: string;
    detail?: string;
} {
    const provider = res.provider ?? "your payment provider";
    switch (res.outcome) {
        case "CANCELLED":
            return {
                title: "Autopay cancelled.",
                detail: "The next renewal is invoiced with a pay link.",
            };
        case "CONFIRMING":
            return {
                title: "Autopay is off — nothing more is charged.",
                detail: `${provider} hasn't confirmed yet; Saroh keeps asking.`,
            };
        case "REFUSED":
            return {
                title: "Autopay is off in Saroh — nothing more is charged.",
                detail: `${provider} didn't confirm it. Check it's cancelled in your ${provider} dashboard.`,
            };
        case "ALREADY_OFF":
            return { title: "Autopay was already off." };
    }
}

/**
 * The words that say how a plan's renewals are paid (D14's honest copy):
 * autopay only where the business offers it; otherwise every renewal is an
 * invoice with a pay link, and nothing is charged.
 */
export function renewalWords(offered: boolean): {
    /** Under "New plan". */
    plan: string;
    /** Under "Subscribe someone". */
    subscribe: string;
} {
    return offered
        ? {
              plan: "What you sell on repeat. It renews with an invoice each period, paid by autopay for members who turn it on.",
              subscribe:
                  "It renews with an invoice each period, paid with a pay link until they turn on autopay. Nobody is contacted.",
          }
        : {
              plan: "What you sell on repeat. It renews with an invoice each period; nothing is charged.",
              subscribe:
                  "It renews with an invoice each period. Nothing is charged and nobody is contacted.",
          };
}
