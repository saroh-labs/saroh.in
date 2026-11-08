import { accountMoney, bookingWhen } from "../account/model";

/**
 * The business's `/paid` page after Stripe's hosted Checkout (plan
 * 2026-11-07-002, U8): what the API's read of the session says
 * (`GET /public/payments/checkout/:sessionId`, U7), narrowed, and the page's
 * words for it. Pure, so each state is tested without the page.
 */

/** Where the payment stands, as the API reads it. */
export type PaymentReturnStatus =
    "open" | "processing" | "paid" | "failed" | "closed" | "refunding";

/** What was paid for: a booking hold, a class pack, a plan, an invoice, an order. */
export type PaymentReturnKind = "hold" | "pack" | "join" | "invoice" | "order";

/** The buyer's view of one Checkout payment: never their details or Stripe's ids. */
export interface PaymentReturnView {
    status: PaymentReturnStatus;
    kind: PaymentReturnKind;
    businessName: string;
    amountCents: number;
    currency: string;
    booking: {
        serviceName: string;
        startAt: string;
        endAt: string;
        timezone: string;
    } | null;
    /** The same-site path the customer paid from; null: the kind's default. */
    returnPath: string | null;
}

const STATUSES = new Set<string>([
    "open",
    "processing",
    "paid",
    "failed",
    "closed",
    "refunding",
]);
const KINDS = new Set<string>(["hold", "pack", "join", "invoice", "order"]);

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isString = (v: unknown): v is string => typeof v === "string";

/**
 * Only a relative path on this site: one `/`, no `//` or `\`, no control
 * characters, at most 512 characters (the API's `safeReturnPath`, asked
 * again here as the page redirects to it).
 */
export function sameSitePath(v: unknown): string | null {
    if (!isString(v) || v.length === 0 || v.length > 512) return null;
    if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) {
        return null;
    }
    for (let i = 0; i < v.length; i++) {
        const code = v.charCodeAt(i);
        if (code < 32 || code === 127) return null;
    }
    return v;
}

/** The API's answer narrowed to the view, or null when it isn't one. */
export function paymentReturnOf(v: unknown): PaymentReturnView | null {
    if (!isRecord(v)) return null;
    if (!isString(v.status) || !STATUSES.has(v.status)) return null;
    if (!isString(v.kind) || !KINDS.has(v.kind)) return null;
    if (!isString(v.businessName) || !isString(v.currency)) return null;
    if (typeof v.amountCents !== "number") return null;
    const b = v.booking;
    const booking =
        isRecord(b) &&
        isString(b.serviceName) &&
        isString(b.startAt) &&
        isString(b.endAt) &&
        isString(b.timezone)
            ? {
                  serviceName: b.serviceName,
                  startAt: b.startAt,
                  endAt: b.endAt,
                  timezone: b.timezone,
              }
            : null;
    return {
        status: v.status as PaymentReturnStatus,
        kind: v.kind as PaymentReturnKind,
        businessName: v.businessName,
        amountCents: v.amountCents,
        currency: v.currency,
        booking,
        returnPath: sameSitePath(v.returnPath),
    };
}

/**
 * Where "Back" and "Try again" go: the page the customer paid from, else
 * the kind's own page. A booking goes to `/book`, a pack to the account, a
 * plan to the site's Prices page (`pricesPath`); an invoice or an order
 * the API kept no page for goes home.
 */
export function backPathOf(
    view: Pick<PaymentReturnView, "kind" | "returnPath">,
    pricesPath: string | null = null,
): string {
    if (view.returnPath) return view.returnPath;
    switch (view.kind) {
        case "hold":
            return "/book";
        case "pack":
            return "/account";
        case "join":
            return sameSitePath(pricesPath) ?? "/";
        default:
            return "/";
    }
}

/** How often, and how many times, the page asks again while confirming. */
export const RETURN_POLL_MS = 2_000;
export const RETURN_POLL_TRIES = 30;

export interface PaymentReturnWords {
    title: string;
    body: string;
    /** The button: back to the business, or to try paying again. */
    action: string;
    /** A failure the customer must act on, said as an alert. */
    problem: boolean;
}

/** The page's words for a view; `late` once confirming has gone on too long. */
export function paymentReturnWords(
    view: PaymentReturnView,
    late = false,
): PaymentReturnWords {
    const business = view.businessName;
    const back = `Back to ${business}`;
    const amount = accountMoney(
        (view.amountCents / 100).toFixed(2),
        view.currency,
    );
    switch (view.status) {
        case "open":
            return late
                ? {
                      title: "Still confirming your payment",
                      body: `This is taking longer than usual. ${business} will email you once it's through. There's no need to pay again.`,
                      action: back,
                      problem: false,
                  }
                : {
                      title: "Confirming your payment",
                      body: "Hold on a moment. This page updates by itself.",
                      action: back,
                      problem: false,
                  };
        case "processing":
            return {
                title: "Payment processing",
                body: `Your payment of ${amount} is on its way. ${business} will email you once it's through.`,
                action: back,
                problem: false,
            };
        case "paid": {
            const b = view.booking;
            if (b) {
                const when = bookingWhen(b.startAt, b.timezone);
                const what = b.serviceName ? `${b.serviceName}, ` : "";
                return {
                    title: "You're booked",
                    body: `${what}${when}. You paid ${amount}.`,
                    action: back,
                    problem: false,
                };
            }
            const where =
                view.kind === "pack"
                    ? " Your pack shows in your account."
                    : view.kind === "join"
                      ? " Your plan shows in your account."
                      : "";
            return {
                title: "Payment received",
                body: `${business} has your payment of ${amount}.${where}`,
                action: back,
                problem: false,
            };
        }
        case "refunding":
            return {
                title: "Your money is on its way back",
                body: `Your payment came after the time was released. It's being refunded in full, and ${business} has been told.`,
                action: back,
                problem: false,
            };
        case "failed":
            return {
                title: "That payment didn't go through",
                body: "Nothing was taken. Try again, or use another way to pay.",
                action: "Try again",
                problem: true,
            };
        case "closed":
            return {
                title: "This payment has closed",
                body:
                    view.kind === "hold"
                        ? "Nothing was taken, and the time went back on the calendar. Pick a time again when you're ready."
                        : "Nothing was taken. Start again when you're ready.",
                action: "Try again",
                problem: true,
            };
    }
}
