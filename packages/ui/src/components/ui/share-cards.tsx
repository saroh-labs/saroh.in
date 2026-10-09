"use client";

import type { ShareImageFacts } from "../../lib/share-facts";
import {
    inspectorLinks,
    isWhatsappLarge,
    shareImageWarnings,
} from "../../lib/share-facts";
import { cn } from "../../lib/utils";
import { ShareCard } from "./share-card";

export {
    inspectorLinks,
    SHARE_IMAGE_MIN,
    shareImageWarnings,
    webImageUrl,
    WHATSAPP_MAX_BYTES,
} from "../../lib/share-facts";
export type { ShareImageFacts } from "../../lib/share-facts";
export { ShareCard } from "./share-card";
export type { ShareCardProps, SharePlatform } from "./share-card";

/**
 * What a site's link looks like on each app, under its share settings
 * (#220): the six cards the link preview tool on saroh.in draws, from the
 * same `ShareCard` (resources plan KTD-4), with the picture's warnings and,
 * once the site is live, the two inspectors that refetch a cached card.
 *
 * Instagram is listed and not drawn: it does not unfurl links in captions,
 * bios or most messages. Drawing a card for it would be the one dishonest
 * thing on the screen.
 */
export interface ShareCardsProps {
    /** og:title as published: the search title, or the site name. */
    title: string;
    /** og:description as published; empty means none. */
    description: string;
    /** og:site_name. */
    siteName: string;
    /** The host the link is shared as, or null before the site has an address. */
    domain: string | null;
    image: ShareImageFacts | null;
    /** Set once the site has been published: enables the inspector links. */
    liveUrl: string | null;
    /**
     * Draw WhatsApp alone, the app most of a business's customers in India
     * see the link in, and fold the others under "See N more apps". The
     * link preview tool on saroh.in draws them all; the site's settings
     * fold them (Website › Settings audit).
     */
    fold?: boolean;
    className?: string;
}

const DRAWN = [
    ["whatsapp", "WhatsApp"],
    ["facebook", "Facebook"],
    ["linkedin", "LinkedIn"],
    ["x", "X"],
    ["slack", "Slack"],
    ["google", "Google"],
] as const;

export function ShareCards({
    title,
    description,
    siteName,
    domain,
    image,
    liveUrl,
    fold = false,
    className,
}: ShareCardsProps) {
    const host = domain ?? "your-site.saroh.app";
    const warnings = shareImageWarnings(image);
    const drawn = DRAWN.map(([platform, name]) => (
        <figure key={platform} className="min-w-0">
            <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">{name}</span>
                {platform === "whatsapp" && image && !isWhatsappLarge(image) ? (
                    <span className="truncate text-muted-foreground">
                        small thumbnail — see below
                    </span>
                ) : null}
            </figcaption>
            <ShareCard
                platform={platform}
                title={title}
                description={description}
                siteName={siteName}
                domain={host}
                image={image}
            />
        </figure>
    ));
    const instagram = (
        <figure className="min-w-0">
            <figcaption className="mb-1.5 text-xs font-medium">
                Instagram
            </figcaption>
            <div className="rounded border border-dashed p-3 text-[13px] leading-snug text-muted-foreground">
                Instagram shows the link as text. It does not unfurl links in
                captions, bios or most messages, so there is no card to design.
            </div>
        </figure>
    );

    return (
        <div className={cn("space-y-4", className)}>
            {fold ? (
                <>
                    <div className="max-w-sm">{drawn.slice(0, 1)}</div>
                    <details className="group" data-more-apps>
                        <summary className="inline-flex cursor-pointer items-center rounded-sm py-1 text-sm font-medium underline underline-offset-2 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground coarse:min-h-11">
                            <span className="group-open:hidden">
                                {/* The five other cards, and Instagram. */}
                                See {DRAWN.length} more apps
                            </span>
                            <span className="hidden group-open:inline">
                                Hide the other apps
                            </span>
                        </summary>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            {drawn.slice(1)}
                            {instagram}
                        </div>
                    </details>
                </>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {drawn}
                    {instagram}
                </div>
            )}

            {warnings.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                    {warnings.map((w) => (
                        <li key={w} className="flex gap-2">
                            <span aria-hidden className="text-warning">
                                •
                            </span>
                            <span>{w}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            <p className="text-xs text-muted-foreground">
                How each app should draw it. They crop and cache differently,
                and only fetch a published address
                {liveUrl ? (
                    <>
                        {" "}
                        — once you have changed the picture, ask{" "}
                        {inspectorLinks(liveUrl).map((l, i) => (
                            <span key={l.href}>
                                {i > 0 ? " or " : ""}
                                <a
                                    href={l.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-2 hover:text-foreground active:text-muted-foreground"
                                >
                                    {l.label}
                                </a>
                            </span>
                        ))}{" "}
                        to look again.
                    </>
                ) : (
                    "."
                )}
            </p>
        </div>
    );
}
