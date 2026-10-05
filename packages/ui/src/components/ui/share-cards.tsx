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
    className,
}: ShareCardsProps) {
    const host = domain ?? "your-site.saroh.app";
    const warnings = shareImageWarnings(image);

    return (
        <div className={cn("space-y-4", className)}>
            <div className="grid gap-4 sm:grid-cols-2">
                {DRAWN.map(([platform, name]) => (
                    <figure key={platform} className="min-w-0">
                        <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                            <span className="font-medium">{name}</span>
                            {platform === "whatsapp" &&
                            image &&
                            !isWhatsappLarge(image) ? (
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
                ))}

                <figure className="min-w-0">
                    <figcaption className="mb-1.5 text-xs font-medium">
                        Instagram
                    </figcaption>
                    <div className="rounded border border-dashed p-3 text-[13px] leading-snug text-muted-foreground">
                        Instagram shows the link as text. It does not unfurl
                        links in captions, bios or most messages, so there is no
                        card to design.
                    </div>
                </figure>
            </div>

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
