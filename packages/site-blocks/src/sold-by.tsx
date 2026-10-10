import { phoneText } from "./lib/phone";
import { cn } from "./lib/utils";

/**
 * Who a customer is buying from (DEC-121, as amended 10 Oct): the business,
 * in its own details — its legal name, registered address and a contact —
 * never a sentence Saroh wrote about it. In the site's own tokens and type.
 * The footer carries the whole block; an order or booking confirmation
 * carries the first line.
 */
export interface SiteSeller {
    /** "Sold by" on a site that sells products, "Run by" on one that doesn't. */
    lead: SellerLead;
    /** The legal name, or the business's name when it has set none. */
    name: string;
    /** The registered address on one line; null when it has set none. */
    address?: string | null;
    /** A contact the footer doesn't already show; null draws none. */
    email?: string | null;
    phone?: string | null;
}

export type SellerLead = "Sold by" | "Run by";

/** A shop sells; a site with no shop (bookings, a portfolio) is run. */
export function sellerLead(sellsProducts: boolean): SellerLead {
    return sellsProducts ? "Sold by" : "Run by";
}

/** "Sold by Rye Foods LLP", or null without a name to say. */
export function soldByLine(seller: {
    lead: SellerLead;
    name: string;
}): string | null {
    const name = seller.name.trim();
    return name ? `${seller.lead} ${name}` : null;
}

/**
 * Where a Free site's "Report" goes: saroh.in's page for customers, with
 * the site's address filled in for the report.
 */
export function reportBusinessHref(host: string): string {
    const site = host.trim().toLowerCase();
    return site
        ? `https://saroh.in/customers?site=${encodeURIComponent(site)}`
        : "https://saroh.in/customers";
}

const said = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
};

/** The one line a confirmation carries. Draws nothing without a line. */
export function SoldByLine({
    line,
    className,
}: {
    /** "Sold by ‹legal name›", from {@link soldByLine}. */
    line: string | null | undefined;
    className?: string;
}) {
    const text = said(line);
    if (!text) return null;
    return (
        <p
            className={cn("text-[12px] leading-[1.5]", className)}
            data-sold-by=""
        >
            {text}
        </p>
    );
}

/**
 * The footer's block: the line, then the registered address and a contact
 * on quiet lines of their own. Its colour comes from the footer.
 */
export function SoldByBlock({
    seller,
    className,
    linkClassName,
}: {
    seller: SiteSeller;
    className?: string;
    linkClassName?: string;
}) {
    const line = soldByLine(seller);
    if (!line) return null;
    const address = said(seller.address);
    const email = said(seller.email);
    const phone = said(seller.phone);
    return (
        <div
            className={cn("text-[12px] leading-[1.5]", className)}
            data-sold-by=""
        >
            <p>{line}</p>
            {address ? <p>{address}</p> : null}
            {email || phone ? (
                <p>
                    {email ? (
                        <a href={`mailto:${email}`} className={linkClassName}>
                            {email}
                        </a>
                    ) : null}
                    {email && phone ? " · " : null}
                    {phone ? (
                        <a
                            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                            className={linkClassName}
                        >
                            {phoneText(phone)}
                        </a>
                    ) : null}
                </p>
            ) : null}
        </div>
    );
}
