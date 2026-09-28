"use client";

import { useProductSelection } from "../product/product-page";
import { actionButton } from "./add-to-bag";

/**
 * The product page's action where the site can't take an online order now
 * (round-2 G13): no payment provider is connected for the storefront, or
 * it is paused. There is no bag. Instead, "Ask about ordering" opens the
 * site's enquiry form with the product — and the option picked — named in
 * the message, so every site with a shop has a working action.
 *
 * `enquiryHref` is the page holding the site's enquiry form (the site's
 * server finds it); the form fills its message from `?about=`. A site with
 * no enquiry form but a public phone offers a call instead. With neither,
 * nothing is drawn: a button that goes nowhere is worse than none.
 */

/** Where the enquiry form is, with the product named for its message. */
export function askAboutHref(enquiryHref: string, about: string): string {
    const at = enquiryHref.indexOf("#");
    const path = at >= 0 ? enquiryHref.slice(0, at) : enquiryHref;
    const hash = at >= 0 ? enquiryHref.slice(at + 1) : "enquiry";
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}about=${encodeURIComponent(about)}#${hash}`;
}

export function AskAboutOrdering({
    enquiryHref,
    phone,
    businessName,
}: {
    /** The page with the site's enquiry form, or null when it has none. */
    enquiryHref: string | null;
    /** The business's public phone, as E.164, or null. */
    phone: string | null;
    businessName: string;
}) {
    const selection = useProductSelection();
    if (!selection) return null;
    const about = selection.variantTitle
        ? `${selection.name} (${selection.variantTitle})`
        : selection.name;

    if (enquiryHref) {
        return (
            <div>
                <a
                    href={askAboutHref(enquiryHref, about)}
                    className={actionButton}
                >
                    Ask about ordering
                </a>
                <p className="text-site-muted mt-2 text-xs">
                    Send {businessName} a message about this, and they'll get
                    back to you.
                </p>
            </div>
        );
    }
    if (phone) {
        return (
            <div>
                <a
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    className={actionButton}
                >
                    Call to order
                </a>
                <p className="text-site-muted mt-2 text-xs">
                    Ask {businessName} about ordering {about}.
                </p>
            </div>
        );
    }
    return null;
}
