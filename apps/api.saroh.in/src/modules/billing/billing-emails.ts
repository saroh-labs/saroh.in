/**
 * The words of Saroh's own billing mail to a business (pricing catalogue
 * U17): the invoice for a charge, a payment that failed, a first month
 * (DEC-093) or a free trial about to end, a plan about to renew (#804), a plan that ends on a date
 * (#805), a 12-month term about to end (DEC-100), and what a move to a
 * lower plan pauses (#801). Pure; every value is
 * escaped, since a business's name is text its owner typed. Merchant
 * voice: say what happened and what happens next.
 */

import { KEEP_EVERYTHING } from "./over-limit";

export interface RenderedEmail {
    subject: string;
    html: string;
}

function esc(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** A link the email asks the reader to follow. */
interface EmailAction {
    label: string;
    href: string;
}

function wrap(
    heading: string,
    paragraphs: string[],
    action?: EmailAction,
): string {
    const button = action
        ? `  <p><a href="${esc(action.href)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${esc(action.label)}</a></p>\n`
        : "";
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(heading)}</h2>
${paragraphs.map((p) => `  <p>${esc(p)}</p>`).join("\n")}
${button}  <p style="color:#666;font-size:12px">You're getting this because you look after billing for your business on Saroh.</p>
</div>`;
}

/**
 * What pauses when a move to a lower plan takes effect (#801): the date,
 * then one line per kind of thing (`pauseLines`), in the order a notice
 * lists them. Given only when something pauses.
 */
export interface PausesWords {
    /** When it pauses, in the business's words ("16 Nov 2026"). */
    pausesOn: string;
    /** `pauseLines(summary)`: never empty when given. */
    lines: string[];
}

/**
 * Whose limits a notice means: `new` while the move is still ahead (the
 * plan the business moves to), `yours` once it has happened (a move made
 * now: the plan it is already on).
 */
export type PausesPlan = "new" | "yours";

/** The paragraphs a notice adds for what pauses; none when nothing does. */
export function pausesParagraphs(
    pauses?: PausesWords | null,
    plan: PausesPlan = "new",
): string[] {
    if (!pauses || pauses.lines.length === 0) return [];
    const whose = plan === "yours" ? "your plan's" : "the new plan's";
    return [
        `On ${pauses.pausesOn}, what's over ${whose} limits becomes read-only:`,
        ...pauses.lines,
    ];
}

/** The same, run together for an inbox notice's body. */
export function pausesSentence(
    pauses?: PausesWords | null,
    plan: PausesPlan = "new",
): string {
    const p = pausesParagraphs(pauses, plan);
    return p.length ? ` ${p.join(" ")}` : "";
}

/** The invoice for a charge, with its PDF attached. */
export function invoiceEmail(input: {
    businessName: string;
    number: string;
    planName: string;
    total: string;
    period: string | null;
}): RenderedEmail {
    return {
        subject: `Your Saroh invoice ${input.number}`,
        html: wrap(`Invoice ${input.number}`, [
            `We've charged ${input.total} for ${input.businessName}'s ${input.planName} plan${input.period ? `, ${input.period}` : ""}.`,
            "Your invoice is attached. You'll also find it in Settings › Plan.",
        ]),
    };
}

/**
 * A payment for the plan didn't go through. `final`: the provider stopped
 * retrying and the business is now on Free; otherwise it is being retried.
 */
export function paymentFailedEmail(input: {
    businessName: string;
    planName: string;
    final: boolean;
}): RenderedEmail {
    if (input.final) {
        return {
            subject: `${input.businessName} is now on the Free plan`,
            html: wrap("Your payment didn't go through", [
                `We tried several times to take the payment for ${input.businessName}'s ${input.planName} plan, and it didn't go through. ${input.businessName} is now on the Free plan.`,
                "Everything you made is kept. Choose a plan again in Settings › Plan whenever you're ready.",
            ]),
        };
    }
    return {
        subject: `Payment for ${input.businessName}'s plan didn't go through`,
        html: wrap("Your payment didn't go through", [
            `The payment for ${input.businessName}'s ${input.planName} plan didn't go through. We'll try again over the next few days.`,
            "Check the card or UPI autopay you paid with. If every try fails, the business moves to the Free plan; nothing you made is lost.",
        ]),
    };
}

/**
 * A free trial ends soon and the first charge follows (U16 queues it).
 * Only a trial that cost nothing: a paid first month says so instead
 * ({@link firstMonthEndingEmail}).
 */
export function trialEndingEmail(input: {
    businessName: string;
    planName: string;
    endsOn: string;
    total: string;
}): RenderedEmail {
    return {
        subject: `${input.businessName}'s ${input.planName} trial ends on ${input.endsOn}`,
        html: wrap("Your trial is ending", [
            `${input.businessName}'s ${input.planName} trial ends on ${input.endsOn}. We'll charge ${input.total} then, and you'll get an invoice.`,
            "To stay on Free instead, change your plan in Settings › Plan before then.",
        ]),
    };
}

/**
 * The nominal first month (DEC-093) ends soon, and the plan's monthly
 * autopay charges start. `total` is the monthly charge with GST.
 */
export function firstMonthEndingEmail(input: {
    businessName: string;
    planName: string;
    endsOn: string;
    total: string;
}): RenderedEmail {
    return {
        subject: `${input.businessName}'s first month on ${input.planName} ends on ${input.endsOn}`,
        html: wrap("Your first month is ending", [
            `${input.businessName}'s first month on the ${input.planName} plan ends on ${input.endsOn}. From then, your autopay pays ${input.total} a month, GST included, and you'll get an invoice for each payment.`,
            "To move to Free instead, change your plan in Settings › Plan before then. Nothing more is charged.",
        ]),
    };
}

/**
 * An autopay charge 3 days ahead (#804, the Terms' promise). `total` is
 * the charge with GST, add-ons included; `renewsOn` in the business's zone.
 */
export function renewalReminderEmail(input: {
    businessName: string;
    planName: string;
    renewsOn: string;
    total: string;
    cycle: "month" | "year";
    withAddons: boolean;
    url: string;
}): RenderedEmail {
    const what = `${input.businessName}'s ${input.planName} plan${input.withAddons ? " and its add-ons" : ""}`;
    return {
        subject: `${input.businessName}'s ${input.planName} plan renews on ${input.renewsOn}`,
        html: wrap(
            `Your ${input.planName} plan renews on ${input.renewsOn}`,
            [
                `On ${input.renewsOn}, your autopay pays ${input.total}, GST included, for another ${input.cycle} of ${what}. You'll get an invoice once it's paid.`,
                `Nothing to do if you're staying on ${input.planName}. To change your plan, or move to Free so nothing more is charged, open Plan and billing before then.`,
            ],
            { label: "Open Plan and billing", href: input.url },
        ),
    };
}

/**
 * A plan that ends on a date (#805: the launch offer, or one Saroh set) and
 * moves the business to a cheaper one. Sent 30, 7 and 1 days ahead.
 */
export function planEndingEmail(input: {
    businessName: string;
    planName: string;
    nextPlanName: string;
    endsOn: string;
    /** What pauses then (#801), when anything does. */
    pauses?: PausesWords | null;
}): RenderedEmail {
    return {
        subject: `${input.businessName}'s ${input.planName} plan ends on ${input.endsOn}`,
        html: wrap(`Your ${input.planName} plan ends on ${input.endsOn}`, [
            `${input.businessName} is on the ${input.planName} plan until ${input.endsOn}. After that it moves to the ${input.nextPlanName} plan.`,
            ...pausesParagraphs(input.pauses),
            `Everything you made is kept. To stay on ${input.planName}, choose a plan in Settings › Plan before then.`,
        ]),
    };
}

/** The same notice in the business's inbox (`plan.ending`). */
export function planEndingNotice(input: {
    planName: string;
    nextPlanName: string;
    endsOn: string;
    pauses?: PausesWords | null;
}): { title: string; body: string } {
    return {
        title: `Your ${input.planName} plan ends on ${input.endsOn}`,
        body: `After that, your business moves to the ${input.nextPlanName} plan.${pausesSentence(input.pauses)} Everything you made is kept. To stay on ${input.planName}, choose a plan in Settings › Plan.`,
    };
}

/** How a term was paid: monthly autopay, or once for the year. */
export type TermPayment = "AUTOPAY" | "ONE_TIME";

/**
 * A 12-month term ends soon (DEC-100): the monthly plan's 12 charges are
 * done, or the year paid for is ending. Asks for the next term's payment
 * at the price now; with none, the plan moves to Free at the end. Sent 30,
 * 7 and 1 days ahead. `price` is the plan's live price before GST, worded
 * ("₹999"), or null when the live catalogue no longer has the plan.
 */
export function termEndingEmail(input: {
    businessName: string;
    planName: string;
    endsOn: string;
    payment: TermPayment;
    price: string | null;
    payUrl: string;
    /** The owner chose Free for the end: say so, ask nothing. */
    chosenFree?: boolean;
    /** What pauses on Free (#801), when anything does. */
    pauses?: PausesWords | null;
}): RenderedEmail {
    if (input.chosenFree) return freeChosenEmail(input);
    const done =
        input.payment === "AUTOPAY"
            ? `${input.businessName}'s 12 monthly payments for the ${input.planName} plan are done, and its term ends on ${input.endsOn}.`
            : `The year ${input.businessName} paid for on the ${input.planName} plan ends on ${input.endsOn}.`;
    const price = input.price
        ? input.payment === "AUTOPAY"
            ? ` The price now is ${input.price} a month plus GST, for another 12 months.`
            : ` The price now is ${input.price} for the year plus GST.`
        : "";
    return {
        subject: `Pay for ${input.businessName}'s next ${input.planName} term by ${input.endsOn}`,
        html: wrap(
            `Your ${input.planName} term ends on ${input.endsOn}`,
            [
                done,
                `To keep ${input.planName}, pay for the next term in Plan and billing. Paying starts your next term when this one ends.${price}`,
                `If you don't pay, ${input.businessName} moves to the Free plan on ${input.endsOn}. Everything you made is kept.`,
                ...pausesParagraphs(input.pauses),
            ],
            { label: "Pay for the next term", href: input.payUrl },
        ),
    };
}

/**
 * The term ends and the owner chose Free for then (DEC-100): no request to
 * pay, only what happens, and how to change their mind.
 */
export function freeChosenEmail(input: {
    businessName: string;
    planName: string;
    endsOn: string;
    payUrl: string;
    pauses?: PausesWords | null;
}): RenderedEmail {
    return {
        subject: `${input.businessName} moves to the Free plan on ${input.endsOn}`,
        html: wrap(
            `Your plan moves to Free on ${input.endsOn}, as you chose`,
            [
                `${input.businessName}'s ${input.planName} plan ends on ${input.endsOn}, and the business moves to the Free plan, as you chose. Everything you made is kept.`,
                ...pausesParagraphs(input.pauses),
                `Changed your mind? Choose ${input.planName} again in Plan and billing before then.`,
            ],
            { label: "Open Plan and billing", href: input.payUrl },
        ),
    };
}

/** The same in the business's inbox (`plan.ending`). */
export function freeChosenNotice(input: {
    planName: string;
    endsOn: string;
    pauses?: PausesWords | null;
}): {
    title: string;
    body: string;
} {
    return {
        title: `Your plan moves to Free on ${input.endsOn}, as you chose`,
        body: `Your ${input.planName} plan ends then.${pausesSentence(input.pauses)} Everything you made is kept. To keep ${input.planName}, choose it again in Plan and billing.`,
    };
}

/** The same request in the business's inbox (`plan.ending`). */
export function termEndingNotice(input: {
    planName: string;
    endsOn: string;
    pauses?: PausesWords | null;
}): {
    title: string;
    body: string;
} {
    return {
        title: `Your ${input.planName} term ends on ${input.endsOn}`,
        body: `To keep ${input.planName}, pay for the next term in Plan and billing. If you don't, your business moves to Free on ${input.endsOn}.${pausesSentence(input.pauses)} Everything you made is kept.`,
    };
}

/**
 * A move to a lower plan that pauses things (#801): one the business chose
 * for its period's end (`scheduled`: a cheaper plan, or Free), or one that
 * already happened (`now`: a payment that failed for good, a cancel now, a
 * limit Saroh lowered). Either way the pause waits at least 7 days from
 * this notice. Lists exactly what pauses, and how to keep everything.
 */
export interface MoveDownWords {
    businessName: string;
    mode: "scheduled" | "now";
    /** The plan it is on now (`now`), or moves from (`scheduled`). */
    planName: string;
    /** The plan it moves to (`scheduled`). */
    nextPlanName: string | null;
    /** When the move takes effect (`scheduled`). */
    movesOn: string | null;
    pausesOn: string;
    lines: string[];
    url: string;
}

/** A move made now is already on the lower plan: "your plan's limits". */
function pausesPlanOf(mode: MoveDownWords["mode"]): PausesPlan {
    return mode === "now" ? "yours" : "new";
}

function moveDownLead(w: MoveDownWords): string {
    return w.mode === "scheduled"
        ? `${w.businessName} moves from the ${w.planName} plan to the ${w.nextPlanName ?? "Free"} plan on ${w.movesOn ?? w.pausesOn}.`
        : `${w.businessName} is now on the ${w.planName} plan, and has more than the plan includes.`;
}

/** The email for {@link MoveDownWords}. */
export function moveDownEmail(w: MoveDownWords): RenderedEmail {
    return {
        subject: `What pauses at ${w.businessName} on ${w.pausesOn}`,
        html: wrap(
            `Some things pause on ${w.pausesOn}`,
            [
                moveDownLead(w),
                ...pausesParagraphs(
                    { pausesOn: w.pausesOn, lines: w.lines },
                    pausesPlanOf(w.mode),
                ),
                KEEP_EVERYTHING,
            ],
            { label: "Open Plan and billing", href: w.url },
        ),
    };
}

/** The same in the business's inbox (`plan.ending`). */
export function moveDownNotice(
    w: Omit<MoveDownWords, "businessName" | "url">,
): {
    title: string;
    body: string;
} {
    const lead =
        w.mode === "scheduled"
            ? `Your plan moves to ${w.nextPlanName ?? "Free"} on ${w.movesOn ?? w.pausesOn}.`
            : `Your business is now on the ${w.planName} plan, and has more than it includes.`;
    return {
        title: `Some things pause on ${w.pausesOn}`,
        body: `${lead}${pausesSentence({ pausesOn: w.pausesOn, lines: w.lines }, pausesPlanOf(w.mode))} ${KEEP_EVERYTHING}`,
    };
}
