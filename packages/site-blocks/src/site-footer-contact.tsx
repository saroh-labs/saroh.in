import type { SocialNetwork } from "@saroh/block-contract";

import type { OpeningHoursDay } from "./lib/opening-hours";
import { weekSummary } from "./lib/opening-hours";
import { phoneText } from "./lib/phone";
import { isSocialLink } from "./lib/public-contact";
import { SocialLinkRow } from "./social-icons";

/**
 * How to reach the business, at the foot of every page (UX-038, DEC-101,
 * DEC-125): its public phone, its contact email, where customers come and
 * its social links. Every value is the business's own, set in Settings and
 * read live, so a change shows without a publish.
 */
export interface SiteContact {
    phone: string | null;
    /**
     * One address line, from before the site could list places. Drawn only
     * while `places` isn't given.
     */
    address: string | null;
    email?: string | null;
    /** Where customers come (DEC-125): one place, or each by name. */
    places?: readonly SiteContactPlace[];
    /** The business's social links, each a network's own address. */
    social?: readonly { network: SocialNetwork; url: string }[];
}

export interface SiteContactPlace {
    /** The location's name; said only when there is more than one place. */
    name: string | null;
    /** Lines joined by "\n". */
    address: string;
    hours?: readonly OpeningHoursDay[] | null;
}

/** A link in the footer, in the footer's own colours. */
export const FOOTER_LINK =
    "focus-visible:ring-site-footer-fg rounded-sm underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2";

/** A link someone taps: a full 44px target on a touch pointer. */
const TAP_LINK = `${FOOTER_LINK} coarse:min-h-11 inline-flex items-center`;

/** A trimmed string, or null when there is nothing in it. */
function nonBlank(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

/** An address on one line: its lines trimmed and joined with commas. */
function oneLine(address: string): string {
    return address
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(", ");
}

/** A maps search for an address: where "Get directions" opens. */
export function addressDirectionsHref(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        oneLine(address),
    )}`;
}

/** The parts of a contact that have something in them. */
export function shownContact(contact: SiteContact | null | undefined) {
    const places = (contact?.places ?? []).flatMap((place) => {
        const address = nonBlank(place.address);
        return address ? [{ ...place, address }] : [];
    });
    return {
        phone: nonBlank(contact?.phone),
        email: nonBlank(contact?.email),
        places,
        // The one line from before places, only where no place is listed.
        address: contact?.places ? null : nonBlank(contact?.address),
        // Re-checked here: a link that isn't a network's own address is
        // never drawn, whoever passed it.
        social: (contact?.social ?? []).filter(isSocialLink),
    };
}

/**
 * The footer's contact group. Draws nothing at all when nothing is set: a
 * site with no phone, email, address or social link has no empty group.
 *
 * - The phone is a `tel:` link in E.164, written the way it is read.
 * - The email is a `mailto:` link.
 * - One place is its address, "Get directions" and the week it opens;
 *   several are each named. Directions open the merchant's own Google Maps
 *   link when there is one place and they set one, else a search for the
 *   address.
 * - Social links are icons in the footer's own colour.
 */
export function FooterContact({
    contact,
    align,
}: {
    contact: SiteContact | null | undefined;
    align: "centre" | "left";
}) {
    const { phone, email, places, address, social } = shownContact(contact);
    const ownMap = social.find((link) => link.network === "googleMaps")?.url;
    const justify = align === "centre" ? "justify-center" : "justify-start";
    if (
        !phone &&
        !email &&
        !address &&
        places.length === 0 &&
        social.length === 0
    ) {
        return null;
    }

    return (
        <div data-site-contact="" className="mb-3 text-[13px]">
            {phone || email || address ? (
                <p
                    className={`mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${justify}`}
                >
                    {phone ? (
                        <a
                            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                            className={TAP_LINK}
                        >
                            {/* "+91 98450 12345", as Visit us
                                writes it (DEC-053, #874). */}
                            Call {phoneText(phone)}
                        </a>
                    ) : null}
                    {email ? (
                        <a href={`mailto:${email}`} className={TAP_LINK}>
                            {email}
                        </a>
                    ) : null}
                    {address ? <span>{address}</span> : null}
                </p>
            ) : null}
            {places.length > 0 ? (
                <ul className="mb-2 grid list-none gap-1.5 p-0">
                    {places.map((place) => {
                        const hours = weekSummary(place.hours ?? null);
                        const named = places.length > 1 && place.name?.trim();
                        return (
                            <li
                                key={`${place.name ?? ""}|${place.address}`}
                                className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${justify}`}
                            >
                                <address className="not-italic">
                                    {named ? (
                                        <span className="font-semibold">
                                            {named}:{" "}
                                        </span>
                                    ) : null}
                                    {oneLine(place.address)}
                                </address>
                                <a
                                    href={
                                        places.length === 1 && ownMap
                                            ? ownMap
                                            : addressDirectionsHref(
                                                  place.address,
                                              )
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={TAP_LINK}
                                >
                                    Get directions
                                </a>
                                {hours ? <span>{hours}</span> : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            <SocialLinkRow
                links={social}
                ring="focus-visible:ring-site-footer-fg"
                className={justify}
            />
        </div>
    );
}
