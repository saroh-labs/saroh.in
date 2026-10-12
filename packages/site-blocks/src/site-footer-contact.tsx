import type { SocialNetwork } from "@saroh/block-contract";
import { mapLinkOrNull } from "@saroh/block-contract";

import type { OpeningHoursDay } from "./lib/opening-hours";
import { phoneText } from "./lib/phone";
import { isSocialLink } from "./lib/public-contact";
import { reachOf } from "./reach-links";
import { FooterHours } from "./site-footer-hours";
import type { SiteNavItem } from "./site-header-menu";
import { SiteFooterMenu } from "./site-header-menu";
import { SocialLinkRow } from "./social-icons";

/**
 * How to reach the business, at the foot of every page (UX-038, DEC-101,
 * DEC-128): its public phone, its contact email, where customers come and
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
    /** Where customers come (DEC-128): one place, or each by name. */
    places?: readonly SiteContactPlace[];
    /** The business's social links, each a network's own address. */
    social?: readonly { network: SocialNetwork; url: string }[];
    /**
     * The business's zone (DEC-033), for marking today in each place's
     * week. Absent reads as India, as everywhere a day is worked out.
     */
    timeZone?: string | null;
}

export interface SiteContactPlace {
    /** The location's name; said only when there is more than one place. */
    name: string | null;
    /** Lines joined by "\n". */
    address: string;
    hours?: readonly OpeningHoursDay[] | null;
    /**
     * The place on Google Maps, which "Get directions" opens. Without one
     * directions are a search for the address.
     */
    mapUrl?: string | null;
}

/**
 * A link in the footer, in the footer's own colours. Underlined, so it
 * reads as a link without leaning on a colour; the line thickens under the
 * pointer and the ring is the footer's own text colour, which the palette
 * holds to 4.5:1 on the footer.
 */
export const FOOTER_LINK =
    "focus-visible:ring-site-footer-fg rounded-sm underline decoration-1 underline-offset-[3px] transition-[text-decoration-color,opacity] duration-150 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-site-footer-bg active:opacity-70";

/** A link someone taps: a full 44px target on a touch pointer. */
const TAP_LINK = `${FOOTER_LINK} coarse:min-h-11 inline-flex items-center`;

/**
 * A page in the footer's menu: plain until the pointer is on it, since a
 * list of pages under "Pages" needs no underline to read as links.
 */
const MENU_LINK =
    "focus-visible:ring-site-footer-fg coarse:min-h-11 inline-flex min-h-8 items-center rounded-sm underline decoration-transparent decoration-1 underline-offset-[3px] transition-[text-decoration-color,opacity] duration-150 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-site-footer-bg active:opacity-70 aria-[current=page]:font-bold aria-[current=page]:decoration-current";

/** A column's heading: small, wide-tracked, in the footer's own text colour. */
const COLUMN_HEADING =
    "font-site-body m-0 mb-3 text-[12px] font-bold uppercase leading-snug tracking-[0.12em]";

/** The label over a place's week, one step quieter than a column heading. */
const HOURS_LABEL =
    "font-site-body m-0 mb-1.5 text-[11.5px] font-bold uppercase leading-snug tracking-[0.1em]";

/** A trimmed string, or null when there is nothing in it. */
function nonBlank(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
}

/** An address's lines, trimmed, with the empty ones gone. */
function addressLines(address: string): string[] {
    return address
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

/** An address on one line: its lines trimmed and joined with commas. */
function oneLine(address: string): string {
    return addressLines(address).join(", ");
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

/** Whether the footer has any fact to lay out in columns. */
export function hasFooterFacts(
    contact: SiteContact | null | undefined,
    menu: readonly SiteNavItem[] = [],
): boolean {
    const { phone, email, places, address, social } = shownContact(contact);
    return (
        menu.length > 0 ||
        phone !== null ||
        email !== null ||
        address !== null ||
        places.length > 0 ||
        social.length > 0
    );
}

/**
 * The footer's facts, in columns: where to find the business (each place
 * with its address, "Get directions" and its week), how to get in touch
 * (phone, WhatsApp, email, social links) and the site's pages.
 *
 * Draws nothing at all when nothing is set, and never a heading with
 * nothing under it: a column exists only for facts the business has given.
 * On a phone the columns stack, in the order someone looks for them.
 *
 * - One place is "Find us"; several are each a column under their own name.
 * - The address is an `<address>`, its lines kept. Directions open the
 *   place's own Google Maps link when the merchant gave it one, else a
 *   search for the address.
 * - The phone is a `tel:` link in E.164, written the way it is read; the
 *   email a `mailto:`; WhatsApp the business's own `wa.me` link, said in
 *   words, so it is not repeated among the icons.
 * - Social links are icons in the footer's own colour.
 */
export function FooterContact({
    contact,
    menu = [],
    now,
}: {
    contact: SiteContact | null | undefined;
    /** The site's menu, each address already as the page should link it. */
    menu?: readonly SiteNavItem[];
    /** The moment today is marked for. Fixtures and tests pin it. */
    now?: Date;
}) {
    const { phone, email, places, address, social } = shownContact(contact);
    if (!hasFooterFacts(contact, menu)) return null;

    const whatsapp = reachOf({ phone, email, social }).whatsapp;
    // Said in words under "Get in touch", so not again as an icon.
    const icons = whatsapp
        ? social.filter((link) => link.network !== "whatsapp")
        : social;
    const several = places.length > 1;
    // A way to reach the business in words, as against the icons.
    const direct = phone ?? whatsapp ?? email;
    const inTouch = direct !== null || icons.length > 0;

    return (
        <div
            data-site-contact=""
            className="grid grid-cols-1 gap-x-10 gap-y-9 text-left text-[14.5px] leading-relaxed sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]"
        >
            {places.map((place, i) => {
                const named = several ? nonBlank(place.name) : null;
                return (
                    <section key={`${place.name ?? ""}|${place.address}|${i}`}>
                        <h2 className={COLUMN_HEADING}>{named ?? "Find us"}</h2>
                        <address className="whitespace-pre-line not-italic">
                            {addressLines(place.address).join("\n")}
                        </address>
                        <a
                            href={
                                // Re-checked: only Google's own map pages
                                // are ever a link.
                                mapLinkOrNull(place.mapUrl) ??
                                addressDirectionsHref(place.address)
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${TAP_LINK} mt-1.5`}
                        >
                            Get directions
                        </a>
                        <FooterHours
                            hours={place.hours ?? null}
                            timeZone={contact?.timeZone}
                            now={now}
                            labelClassName={HOURS_LABEL}
                        />
                    </section>
                );
            })}
            {address ? (
                <section>
                    <h2 className={COLUMN_HEADING}>Find us</h2>
                    <address className="not-italic">{address}</address>
                </section>
            ) : null}
            {inTouch ? (
                <section>
                    <h2 className={COLUMN_HEADING}>Get in touch</h2>
                    {direct ? (
                        <ul className="m-0 grid list-none justify-items-start gap-1 p-0">
                            {phone ? (
                                <li>
                                    <a
                                        href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                                        className={TAP_LINK}
                                    >
                                        {/* "+91 98450 12345", as Visit us
                                            writes it (DEC-053, #874). */}
                                        Call {phoneText(phone)}
                                    </a>
                                </li>
                            ) : null}
                            {whatsapp ? (
                                <li>
                                    <a
                                        href={whatsapp}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={TAP_LINK}
                                    >
                                        Message on WhatsApp
                                    </a>
                                </li>
                            ) : null}
                            {email ? (
                                <li>
                                    <a
                                        href={`mailto:${email}`}
                                        className={`${TAP_LINK} [overflow-wrap:anywhere]`}
                                    >
                                        {email}
                                    </a>
                                </li>
                            ) : null}
                        </ul>
                    ) : null}
                    <SocialLinkRow
                        links={icons}
                        ring="focus-visible:ring-site-footer-fg"
                        // The icons' own 44px boxes line up with the text
                        // above by their marks, not their edges.
                        className={`-ml-3 justify-start ${direct ? "mt-2" : ""}`}
                    />
                </section>
            ) : null}
            <SiteFooterMenu
                items={[...menu]}
                heading="Pages"
                headingClassName={COLUMN_HEADING}
                linkClassName={MENU_LINK}
            />
        </div>
    );
}
