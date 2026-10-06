/**
 * The words of Saroh's own billing mail to a business (pricing catalogue
 * U17): the invoice for a charge, a payment that failed, and a trial about
 * to end. Pure; every value is escaped, since a business's name is text its
 * owner typed. Merchant voice: say what happened and what happens next.
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

function wrap(heading: string, paragraphs: string[]): string {
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${esc(heading)}</h2>
${paragraphs.map((p) => `  <p>${esc(p)}</p>`).join("\n")}
  <p style="color:#666;font-size:12px">You're getting this because you look after billing for your business on Saroh.</p>
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

/** A trial ends soon and the first charge follows (U16 queues it). */
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
