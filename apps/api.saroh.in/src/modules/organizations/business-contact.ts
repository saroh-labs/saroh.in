import type { SocialNetwork } from "@saroh/block-contract";
import { socialLinkItems } from "@saroh/block-contract";
import { prisma } from "@saroh/database";

import type { PublicOpeningDay } from "../sites/public-visit.service";
import { publicWeek, registeredAddress } from "../sites/public-visit.service";
import { publicPhone } from "./business-phone";
import { socialLinksRead } from "./business-social";

/**
 * How to reach a business, as its website shows it (DEC-125): the one read
 * behind the site's footer, its structured data and the workspace's
 * "Contact and social" rows, so none of them can disagree.
 *
 * An explicit allow-list, every value the merchant's own and set to be
 * public: the business's phone (DEC-053) and contact email (DEC-101), where
 * customers come, and its social links. Never a member's or an account's
 * email or phone, and never anything about orders, stock or people.
 *
 * **Which address.** Where customers come, not where the business is
 * registered: every location that says customers visit (`SHOP`) and has an
 * address, oldest first. A location with no counter (`ONLINE`) is stock
 * kept for online orders, often at home, and its address is never shown.
 * The registered address is the legal one printed on invoices; it stands in
 * only while no location shows an address AND the owner chose to show it
 * (`siteShowsRegisteredAddress`, off by default).
 */
export interface PublicContact {
    /** E.164, or null: no Call link. */
    phone: string | null;
    /** The business's contact email, or null. */
    email: string | null;
    /** Where customers come. Empty: no address is shown. */
    places: PublicPlace[];
    /** The social links that are set, in the networks' order. */
    social: PublicSocialLink[];
}

export interface PublicPlace {
    /** `location`: a place customers visit; `registered`: the owner's choice. */
    source: "location" | "registered";
    /** The location's name; null for the registered address. */
    name: string | null;
    /** Lines joined by "\n". */
    address: string;
    /** The location's week, or null when none is saved. */
    hours: PublicOpeningDay[] | null;
}

export interface PublicSocialLink {
    network: SocialNetwork;
    url: string;
}

/** Locations listed on a site: a business with more is rare, and a footer
 *  that long helps nobody. */
const PLACES_MAX = 12;

/** A stored value, or null when it says nothing. */
function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/**
 * The one read of a business's public contact details. The caller has
 * already resolved the business (from the site on a public read, from the
 * request's context in the workspace, never from an id the caller sent) and
 * runs this inside that organization's RLS context. Every query filters on
 * the business too.
 */
export async function businessPublicContactOf(
    organizationId: string,
): Promise<PublicContact> {
    const [profile, shops] = await Promise.all([
        prisma.businessProfile.findUnique({
            where: { organizationId },
            select: {
                phone: true,
                contactEmail: true,
                socialLinks: true,
                siteShowsRegisteredAddress: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                postalCode: true,
            },
        }),
        prisma.store.findMany({
            where: {
                organizationId,
                deletedAt: null,
                settings: { is: { kind: "SHOP" } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: PLACES_MAX,
            select: {
                name: true,
                settings: { select: { address: true, openingHours: true } },
            },
        }),
    ]);

    const places: PublicPlace[] = shops.flatMap((shop) => {
        const address = said(shop.settings?.address);
        return address
            ? [
                  {
                      source: "location" as const,
                      name: shop.name,
                      address,
                      hours: publicWeek(shop.settings?.openingHours),
                  },
              ]
            : [];
    });
    if (places.length === 0 && profile?.siteShowsRegisteredAddress) {
        const address = registeredAddress(profile);
        if (address) {
            places.push({
                source: "registered",
                name: null,
                address,
                hours: null,
            });
        }
    }

    return {
        phone: publicPhone(profile?.phone),
        email: said(profile?.contactEmail),
        places,
        social: socialLinkItems(socialLinksRead(profile?.socialLinks)).map(
            ({ network, url }) => ({ network, url }),
        ),
    };
}
