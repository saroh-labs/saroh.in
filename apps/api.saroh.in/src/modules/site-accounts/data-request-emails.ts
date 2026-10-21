import { escapeHtml } from "../communications/transactional";

/**
 * The two emails Saroh sends a customer about their "Ask to remove my data"
 * request (DEC-172, #1106): an acknowledgement when they ask, and a second
 * when the business has dealt with it — done, or closed without removal.
 *
 * They go from Saroh's identity email, the sender of sign-in codes, in the
 * business's name ("‹Business› via Saroh"): DEC-011 as amended by DEC-172,
 * because they are about the customer's own account. So, as the code email:
 * fixed words and the business's name, already cleaned
 * (`sender-name.ts`, `cleanBusinessName`) and escaped again here. Never the
 * business's free-text reason for closing it, and never anything the
 * customer typed.
 *
 * Pure, so every word is tested (`data-request-emails.spec.ts`).
 */

export type DataRequestEmailStep = "received" | "done" | "closed";

export interface DataRequestEmail {
    subject: string;
    html: string;
}

/** What the law keeps, said in the acknowledgement and the done email. */
export const KEPT_BY_LAW =
    "Receipts and invoices are kept as the law requires.";

/**
 * The email for one step. `business` must already be cleaned; it is
 * escaped here for the body.
 */
export function dataRequestEmail(
    step: DataRequestEmailStep,
    business: string,
): DataRequestEmail {
    const name = escapeHtml(business);
    switch (step) {
        case "received":
            return {
                subject: `We've sent your request to ${business}`,
                html: frame(
                    "We've sent your request",
                    [
                        `You asked ${name} to remove your details. Nothing is removed yet: ${name} will review your request, and we'll email you again when it's done.`,
                        KEPT_BY_LAW,
                        `If you didn't ask for this, contact ${name}.`,
                    ],
                    name,
                ),
            };
        case "done":
            return {
                subject: `${business} removed your details`,
                html: frame(
                    "Your details have been removed",
                    [
                        `${name} removed your details, as you asked. Your account on their website is closed, so you won't be able to sign in there with it.`,
                        KEPT_BY_LAW,
                        "Keep this email as your record that it was done.",
                    ],
                    name,
                ),
            };
        case "closed":
            // The business's reason is theirs to give: never in this email.
            return {
                subject: `${business} closed your request`,
                html: frame(
                    "Your request was closed",
                    [
                        `${name} closed your request to remove your details without removing them.`,
                        `To find out why, contact ${name}. You can ask again from your account on their website.`,
                    ],
                    name,
                ),
            };
    }
}

/**
 * The footer every identity email from a business's site carries.
 *
 * TODO(#1156): the sign-in email footer says this address sends "only
 * sign-in codes, and a notice if your sign-in email changes"
 * (`common/email.ts`). It now sends these two notices too; #1156 rewords
 * that footer for all of them. Until then this one says what it sends.
 */
export function dataRequestFooter(name: string): string {
    return `${name}'s website runs on Saroh. This address sends only sign-in codes and notices about your account there.`;
}

/** The body, every value already escaped. */
function frame(heading: string, lines: string[], name: string): string {
    return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
  <h2>${heading}</h2>
${lines.map((line) => `  <p>${line}</p>`).join("\n")}
  <p style="color:#666;font-size:12px">${dataRequestFooter(name)}</p>
</div>`;
}
