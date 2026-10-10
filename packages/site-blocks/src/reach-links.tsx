import { normaliseSocialLink } from "@saroh/block-contract";

import { phoneText } from "./lib/phone";
import type { PublicContact } from "./lib/public-contact";
import { cn } from "./lib/utils";

/**
 * How a customer reaches the business when the page can't help them
 * further: a phone to call and, when the business has WhatsApp, a message.
 *
 * Wherever a page used to say "get in touch with ‹Business›" and stop (no
 * time free, a hold that ran out, a pay page with a question), these are
 * the links. They come from the public contact read (DEC-125), the one the
 * footer shows, so a number is never offered here that the business took
 * off its site. Nothing set draws nothing: the sentence stands alone, as
 * it did.
 *
 * No `"use client"`: a server page draws it too (the pay pages).
 */
export interface BusinessReach {
    /** The public phone, E.164, for `tel:`; null when none is set. */
    phone: string | null;
    /** The business's own WhatsApp link (wa.me); null when it has none. */
    whatsapp: string | null;
    /** Its contact email; null when none is set. */
    email?: string | null;
}

export const NO_REACH: BusinessReach = {
    phone: null,
    whatsapp: null,
    email: null,
};

/** The reach a contact read gives; nothing for a read that failed. */
export function reachOf(
    contact:
        Pick<PublicContact, "phone" | "email" | "social"> | null | undefined,
): BusinessReach {
    if (!contact) return NO_REACH;
    const link = contact.social.find((s) => s.network === "whatsapp");
    // Only WhatsApp's own address, checked again here: never a link that
    // opens anywhere else, whatever was served.
    const check = link ? normaliseSocialLink("whatsapp", link.url) : null;
    return {
        phone: contact.phone?.trim() ? contact.phone.trim() : null,
        whatsapp: check?.ok && check.url === link?.url ? check.url : null,
        email: contact.email?.trim() ? contact.email.trim() : null,
    };
}

/** Whether there is a link to draw. */
export function hasReach(
    reach: BusinessReach | null | undefined,
    withEmail = false,
): boolean {
    return (
        !!reach &&
        (reach.phone !== null ||
            reach.whatsapp !== null ||
            (withEmail && !!reach.email))
    );
}

const LINK =
    "text-site-fg coarse:min-h-11 inline-flex items-center rounded-sm text-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/**
 * "Call +91 80409 92210 · Message on WhatsApp", each a link, in a row that
 * wraps. `email` adds "Email ‹address›" (the pay pages, where a question
 * about a bill is often written). Draws nothing when there is no way.
 */
export function ReachLinks({
    reach,
    email = false,
    className,
}: {
    reach: BusinessReach | null | undefined;
    /** Offer the contact email too. */
    email?: boolean;
    className?: string;
}) {
    if (!reach || !hasReach(reach, email)) return null;
    return (
        <p
            className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-1",
                className,
            )}
        >
            {reach.phone ? (
                <a href={`tel:${reach.phone}`} className={LINK}>
                    Call {phoneText(reach.phone)}
                </a>
            ) : null}
            {reach.whatsapp ? (
                <a
                    href={reach.whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                >
                    Message on WhatsApp
                </a>
            ) : null}
            {email && reach.email ? (
                <a
                    href={`mailto:${reach.email}`}
                    className={cn(LINK, "[overflow-wrap:anywhere]")}
                >
                    Email {reach.email}
                </a>
            ) : null}
        </p>
    );
}
