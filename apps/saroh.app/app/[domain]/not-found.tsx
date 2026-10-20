import { headers } from "next/headers";

import { lookOf } from "@saroh/site-blocks";

import { SiteNotFound } from "@/components/site-not-found";
import { getBookingPage } from "@/lib/booking-page";
import { getCatalogue } from "@/lib/catalogue";
import { headerAction } from "@/lib/header-action";
import { notFoundSecondary } from "@/lib/not-found-ways";
import { getSiteForHost } from "@/lib/publication";

/**
 * Every 404 on a merchant's site: a `notFound()` from any page under
 * `[domain]` (a closed shop, a product, a post or an account tab that isn't
 * there) and every address no route matches (`[...missing]`).
 *
 * Rendered inside `[domain]/layout.tsx`, so the site's own header, menu and
 * footer stay and the visitor can keep browsing. A host with no live site
 * never gets here: the layout's own `notFound()` belongs to the root, which
 * says there is no website at this address (`app/not-found.tsx`).
 *
 * The shop read is the layout's, shared through `cache`; the site read is
 * the same one the layout made. Under a look (DEC-172, U15) the page also
 * offers the site's main action, from the layout's booking read (`cache`
 * again), so Book here is exactly the header's Book.
 */
export default async function NotFound() {
    const host = (await headers()).get("host");
    const resolved = await getSiteForHost(host);
    const catalogue = resolved?.siteId
        ? await getCatalogue(resolved.siteId)
        : null;
    const secondary = resolved
        ? notFoundSecondary({
              pages: resolved.snapshot.pages,
              modules: resolved.modules,
              shopServes: catalogue?.ok ?? false,
          })
        : null;

    const look = lookOf(resolved?.snapshot.site.look);
    const action =
        look && resolved
            ? headerAction({
                  booking: resolved.siteId
                      ? await getBookingPage(resolved.siteId)
                      : null,
                  shopServes: catalogue?.ok ?? false,
                  pages: resolved.snapshot.pages,
                  modules: resolved.modules,
              })
            : null;

    return (
        <SiteNotFound
            siteName={resolved?.snapshot.site.name ?? null}
            secondary={secondary}
            look={look}
            action={action}
        />
    );
}
