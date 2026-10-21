import type { LookId } from "@saroh/block-contract";
import type { SiteHeaderAction } from "@saroh/site-blocks";
import { ctaClasses, frontButton, SitePageMessage } from "@saroh/site-blocks";
import Link from "next/link";

import type { NotFoundWay } from "@/lib/not-found-ways";

/**
 * A page that isn't on the merchant's site (`app/[domain]/not-found.tsx`).
 *
 * Drawn inside the site's own header and footer, in its `--site-*` palette
 * and type, never Saroh's brand: a visitor who followed a broken link is
 * still on the business's website, and the menu above lets them keep
 * browsing. Said in the business's voice ("we"), naming the site.
 *
 * THE SITE'S OWN THEME. `[domain]/layout.tsx` mounts `SiteTheme` with the
 * publication's variables above every page under it, this one included, so
 * the page wears the merchant's colours, font pair and type scale. The
 * frame (`SitePageMessage`) reads them the way a block does: the heading
 * face at the heading scale, the body size, the section padding.
 */
export function SiteNotFound({
    siteName,
    secondary,
    look,
    action = null,
}: {
    /** The published site's name; null if the read found nothing. */
    siteName: string | null;
    /** The shop or contact page, only when the site has one. */
    secondary: NotFoundWay | null;
    /** Folio, Quiet or Live (DEC-172); absent is Classic, unchanged. */
    look?: LookId;
    /** The site's main action (Book, Order, Contact us), for a look. */
    action?: SiteHeaderAction | null;
}) {
    if (look) {
        return (
            <LookNotFound
                look={look}
                siteName={siteName}
                secondary={secondary}
                action={action}
            />
        );
    }
    return (
        <SitePageMessage
            eyebrow="Page not found"
            title={<>We can&rsquo;t find that page</>}
            actions={
                <>
                    <Link href="/" className={ctaClasses("primary")}>
                        Back to home
                    </Link>
                    {secondary ? (
                        <Link
                            href={secondary.href}
                            className={ctaClasses("secondary")}
                        >
                            {secondary.label}
                        </Link>
                    ) : null}
                </>
            }
        >
            {siteName
                ? `There’s no page at this address on ${siteName}. It may have moved, or the link may have a typo.`
                : "There’s no page at this address. It may have moved, or the link may have a typo."}
        </SitePageMessage>
    );
}

/**
 * The 404 under a look (DEC-172, plan U15, #1108; VA26, VD26, VB26): in
 * the look's type with the large "404" beside the words, ONE way back
 * (home, the page's one filled button) and the site's main action (Book)
 * as a link. The shop or contact page stays offered as a link when it is
 * a different place (nothing Classic's 404 offers is taken away). Still a
 * real 404 for search engines: the status is the route's, not the look's.
 */
function LookNotFound({
    look,
    siteName,
    secondary,
    action,
}: {
    look: LookId;
    siteName: string | null;
    secondary: NotFoundWay | null;
    action: SiteHeaderAction | null;
}) {
    const ways: NotFoundWay[] = [];
    if (action && action.href !== "/") {
        ways.push({ href: action.href, label: action.label });
    }
    if (secondary && !ways.some((w) => w.href === secondary.href)) {
        ways.push(secondary);
    }
    return (
        <SitePageMessage
            look={look}
            mark="404"
            eyebrow="Page not found"
            title={<>This page isn&rsquo;t here</>}
            actions={
                <>
                    <Link
                        href="/"
                        data-site-primary=""
                        className={frontButton(look, "fill")}
                    >
                        Go to the home page
                    </Link>
                    {ways.map((way) => (
                        <Link
                            key={way.href}
                            href={way.href}
                            className={frontButton(look, "link")}
                        >
                            {way.label}
                        </Link>
                    ))}
                </>
            }
        >
            {siteName
                ? `It may have moved, or the link has a small typo. Everything ${siteName} offers starts from the home page.`
                : "It may have moved, or the link has a small typo. Everything starts from the home page."}
        </SitePageMessage>
    );
}

/**
 * No website at this address (`app/not-found.tsx`): an unknown host, or a
 * site that is unpublished or paused, so there is no merchant to speak for.
 *
 * Neutral and unbranded: the root boundary mounts `SiteTheme` on its stone
 * defaults (which follow the visitor's light or dark preference). No Saroh
 * mark, colour or face: whoever typed this address came for a business, not
 * for us. No button either: this host has no home page to go back to.
 */
export function NoSiteHere() {
    return (
        // The whole viewport takes the ground: the root layout's body has
        // none, and a dark preference would otherwise leave white margins.
        <div className="min-h-screen bg-site-bg text-site-body">
            <SitePageMessage
                eyebrow="Nothing here"
                title={<>There&rsquo;s no website at this address</>}
                fill
            >
                Check the address for a typo. If this is the right one, the
                website may not be published yet, or may be offline for now.
            </SitePageMessage>
        </div>
    );
}
