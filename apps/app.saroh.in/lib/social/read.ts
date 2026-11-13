import { unstable_rethrow } from "next/navigation";

import { listPosts } from "@/lib/content/service";
import { listDiscounts } from "@/lib/discounts/service";
import { permits } from "@/lib/organizations/permits";
import { listProducts } from "@/lib/products/service";
import { readBookingLink } from "@/lib/services/booking-link-read";
import { listServices } from "@/lib/services/service";
import { readShareSetup } from "@/lib/share-item/read";
import type { ShareSetup } from "@/lib/share-item/share";
import { getSite } from "@/lib/sites/service";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";

import type { LinkSources } from "./links";
import type { PickSources } from "./pick";

/** What Create post reads (#1378), once, on the server. */
export interface CreatePostRead {
    setup: ShareSetup;
    /** The live site's address, where an own post's link goes. */
    origin: string;
    pick: PickSources;
    links: LinkSources;
    /** What couldn't be read, for one "Couldn't load …" line; empty when all was. */
    failed: string[];
}

/**
 * A read that may fail without taking the page: null, said once. Next's
 * own interrupts (a 403's `forbidden()`) go on: each read is asked only
 * of someone whose role reaches it, so one is a real refusal.
 */
const orNull = <T>(read: Promise<T>): Promise<T | null> =>
    read.catch((error: unknown) => {
        unstable_rethrow(error);
        return null;
    });

/**
 * Null while there is no live site to share from (or Share is switched
 * off): the page then says the website needs to be live, once.
 */
export async function readCreatePost(organization: {
    actions?: readonly string[];
}): Promise<CreatePostRead | null> {
    const web = await readWebAddressLinks();
    const setup = await readShareSetup(web);
    if (!web || !setup) return null;
    const may = (action: string) => permits(organization, action);
    const none = Promise.resolve([] as never[]);
    const [products, services, posts, offers, booking, site] =
        await Promise.all([
            may("store:read") ? orNull(listProducts()) : none,
            orNull(listServices()),
            orNull(listPosts(setup.siteId)),
            may("discount:read") ? orNull(listDiscounts()) : none,
            readBookingLink(),
            orNull(getSite(setup.siteId)),
        ]);
    const failed = [
        products ? null : "products",
        services ? null : "services",
        posts ? null : "blog posts",
        offers ? null : "offers",
    ].filter((t): t is string => t !== null);
    return {
        setup,
        origin: web.origin,
        failed,
        pick: {
            products: products ?? [],
            services: services ?? [],
            posts: posts ?? [],
            offers: offers ?? [],
            booking,
            links: web.links,
            postsPrefix: site?.postsPrefix ?? null,
        },
        links: { links: web.links, pages: site?.pages ?? null },
    };
}
