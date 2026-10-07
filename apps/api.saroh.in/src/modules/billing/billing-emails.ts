/**
 * The words of Saroh's own billing mail to a business (pricing catalogue
 * U17): the invoice for a charge, a payment that failed, a first month
 * (DEC-093) or a free trial about to end, a plan that ends on a date
 * (#805), and a 12-month term about to end (DEC-100). Pure; every value is
 * escaped, since a business's name is text its owner typed. Merchant
 * voice: say what happened and what happens next.
 */

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
 * A plan that ends on a date (#805: the launch offer, or one Saroh set) and
 * moves the business to a cheaper one. Sent 30, 7 and 1 days ahead.
 */
export function planEndingEmail(input: {
    businessName: string;
    planName: string;
    nextPlanName: string;
    endsOn: string;
}): RenderedEmail {
    return {
        subject: `${input.businessName}'s ${input.planName} plan ends on ${input.endsOn}`,
        html: wrap(`Your ${input.planName} plan ends on ${input.endsOn}`, [
            `${input.businessName} is on the ${input.planName} plan until ${input.endsOn}. After that it moves to the ${input.nextPlanName} plan.`,
            `Everything you made is kept. To stay on ${input.planName}, choose a plan in Settings › Plan before then.`,
        ]),
    };
}

/** The same notice in the business's inbox (`plan.ending`). */
export function planEndingNotice(input: {
    planName: string;
    nextPlanName: string;
    endsOn: string;
}): { title: string; body: string } {
    return {
        title: `Your ${input.planName} plan ends on ${input.endsOn}`,
        body: `After that, your business moves to the ${input.nextPlanName} plan. Everything you made is kept. To stay on ${input.planName}, choose a plan in Settings › Plan.`,
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
}): RenderedEmail {
    return {
        subject: `${input.businessName} moves to the Free plan on ${input.endsOn}`,
        html: wrap(
            `Your plan moves to Free on ${input.endsOn}, as you chose`,
            [
                `${input.businessName}'s ${input.planName} plan ends on ${input.endsOn}, and the business moves to the Free plan, as you chose. Everything you made is kept.`,
                `Changed your mind? Choose ${input.planName} again in Plan and billing before then.`,
            ],
            { label: "Open Plan and billing", href: input.payUrl },
        ),
    };
}

/** The same in the business's inbox (`plan.ending`). */
export function freeChosenNotice(input: { planName: string; endsOn: string }): {
    title: string;
    body: string;
} {
    return {
        title: `Your plan moves to Free on ${input.endsOn}, as you chose`,
        body: `Your ${input.planName} plan ends then. Everything you made is kept. To keep ${input.planName}, choose it again in Plan and billing.`,
    };
}

/** The same request in the business's inbox (`plan.ending`). */
export function termEndingNotice(input: { planName: string; endsOn: string }): {
    title: string;
    body: string;
} {
    return {
        title: `Your ${input.planName} term ends on ${input.endsOn}`,
        body: `To keep ${input.planName}, pay for the next term in Plan and billing. If you don't, your business moves to Free on ${input.endsOn}. Everything you made is kept.`,
    };
}
