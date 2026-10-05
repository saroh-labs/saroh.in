"use client";

import { useState } from "react";

import type { ShareImageFacts } from "../../lib/share-facts";
import {
    isSmallImage,
    isWhatsappLarge,
    shortLine,
    webImageUrl,
} from "../../lib/share-facts";
import { cn } from "../../lib/utils";

/**
 * One app's card for a shared link, drawn from the four facts every app
 * reads: title, description, picture and domain (#220; resources plan
 * KTD-4, "Saroh Link Preview Card"). The site settings and the link preview
 * tool on saroh.in draw the SAME cards from here.
 *
 * THESE ARE DRAWINGS, NOT FETCHES: each app crops, caches and restyles its
 * cards, and the copy around them says so.
 *
 * The colours are each app's own (WhatsApp's chat green, LinkedIn's grey
 * blue, Google's link blue), not Saroh's: these draw someone else's screen,
 * so they are written as the apps paint them and never follow a theme.
 */

export type SharePlatform =
    | "whatsapp"
    | "facebook"
    | "linkedin"
    | "x"
    | "slack"
    | "google"
    /** The small tile: Telegram, Discord, iMessage and Pinterest. */
    | "small";

export interface ShareCardProps {
    platform: SharePlatform;
    /** og:title as the app reads it. */
    title: string;
    /** og:description; empty means none. */
    description: string;
    /** og:site_name, else the domain. */
    siteName: string;
    /** The host the link is shared as. */
    domain: string;
    image: ShareImageFacts | null;
    className?: string;
}

/**
 * The picture, or the design's striped stand-in with its size when the
 * address can't be drawn or the image doesn't load in this browser.
 */
function Picture({
    image,
    className,
    label = true,
}: {
    image: ShareImageFacts;
    className?: string;
    /** The stand-in's size line; the small tile is too small to hold it. */
    label?: boolean;
}) {
    const src = webImageUrl(image.url);
    // Per address, so a new picture gets its own try.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const failed = src !== null && failedSrc === src;
    const small = isSmallImage(image);
    if (!src || failed) {
        const size =
            image.width && image.height
                ? `${image.width} × ${image.height}${small ? ", too small" : ""}`
                : "Picture";
        return (
            <div
                aria-hidden
                className={cn(
                    "flex items-center justify-center font-mono text-[11px] text-[#4D4941]",
                    small
                        ? "bg-[repeating-linear-gradient(45deg,#E9D9BF_0_8px,#E2CFAF_8px_16px)]"
                        : "bg-[repeating-linear-gradient(45deg,#DCD6C8_0_8px,#D3CCBC_8px_16px)]",
                    className,
                )}
            >
                {label ? size : null}
            </div>
        );
    }
    return (
        // A plain <img>: a picture on someone's own site, not a project asset.
        <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailedSrc(src)}
            className={cn("block w-full bg-[#DCD6C8] object-cover", className)}
        />
    );
}

export function ShareCard({
    platform,
    title,
    description,
    siteName,
    domain,
    image,
    className,
}: ShareCardProps) {
    const desc = description.trim();
    const descShort = desc ? shortLine(desc) : "No description";
    const descLong = desc || "No description found";

    switch (platform) {
        case "whatsapp": {
            // Over 300 KB, or of unknown size, WhatsApp draws a square
            // thumbnail beside the text instead of the large picture.
            const large = !!image && isWhatsappLarge(image);
            return (
                <div
                    className={cn(
                        "flex justify-end rounded-xl bg-[#EFE7DD] p-3.5 text-[#111B21]",
                        className,
                    )}
                >
                    <div className="grid w-[300px] max-w-full gap-1 rounded-[10px] bg-[#D9FDD3] p-1 shadow-[0_1px_1px_rgba(0,0,0,0.1)]">
                        <div
                            className={cn(
                                "overflow-hidden rounded-[7px] bg-[#CDEFC6]",
                                large ? "grid" : "flex items-center gap-2.5",
                            )}
                        >
                            {image ? (
                                <Picture
                                    image={image}
                                    className={
                                        large ? "h-[150px]" : "size-16 shrink-0"
                                    }
                                />
                            ) : null}
                            <div className="grid min-w-0 gap-0.5 px-2.5 py-2">
                                <span className="text-[13.5px] font-semibold leading-[1.3] [overflow-wrap:anywhere]">
                                    {title}
                                </span>
                                <span className="text-[12.5px] leading-[1.35] text-[#4D5B4A]">
                                    {descShort}
                                </span>
                                <span className="text-xs text-[#6B7A68]">
                                    {domain}
                                </span>
                            </div>
                        </div>
                        <span className="truncate px-1.5 py-0.5 text-[13.5px] text-[#0B6E99]">
                            https://{domain}
                        </span>
                        <span className="justify-self-end px-1.5 pb-0.5 text-[11px] text-[#6B7A68]">
                            7:42 pm ✓✓
                        </span>
                    </div>
                </div>
            );
        }
        case "facebook":
            return (
                <div
                    className={cn(
                        "overflow-hidden rounded-lg border border-[#DADDE1] bg-white",
                        className,
                    )}
                >
                    {image ? (
                        <Picture image={image} className="h-[180px]" />
                    ) : null}
                    <div className="grid gap-0.5 bg-[#F0F2F5] px-3 py-2.5">
                        <span className="truncate text-xs uppercase text-[#65676B]">
                            {domain}
                        </span>
                        <span className="text-[15px] font-semibold leading-[1.3] text-[#050505] [overflow-wrap:anywhere]">
                            {title}
                        </span>
                        <span className="text-[13px] text-[#65676B]">
                            {descShort}
                        </span>
                    </div>
                </div>
            );
        case "linkedin":
            return (
                <div
                    className={cn(
                        "overflow-hidden rounded-lg border border-[#E0DFDC] bg-white",
                        className,
                    )}
                >
                    {image ? (
                        <Picture image={image} className="h-[180px]" />
                    ) : null}
                    <div className="grid gap-[3px] bg-[#EEF3F8] px-3 py-2.5">
                        <span className="text-sm font-semibold leading-[1.3] text-[#191919] [overflow-wrap:anywhere]">
                            {title}
                        </span>
                        <span className="truncate text-xs text-[#666666]">
                            {domain}
                        </span>
                    </div>
                </div>
            );
        case "x":
            return (
                <div className={className}>
                    <div className="relative overflow-hidden rounded-2xl border border-[#CFD9DE] bg-white">
                        {image ? (
                            <>
                                <Picture image={image} className="h-[190px]" />
                                <span className="absolute bottom-3 left-3 max-w-[calc(100%-24px)] truncate rounded bg-black/75 px-1.5 py-0.5 text-[12.5px] text-white">
                                    {title}
                                </span>
                            </>
                        ) : (
                            <div className="grid gap-0.5 p-3">
                                <span className="truncate text-[13px] text-[#536471]">
                                    {domain}
                                </span>
                                <span className="text-sm text-[#0F1419] [overflow-wrap:anywhere]">
                                    {title}
                                </span>
                            </div>
                        )}
                    </div>
                    <span className="block truncate pt-1 text-[12.5px] text-[#536471]">
                        From {domain}
                    </span>
                </div>
            );
        case "slack":
            return (
                <div
                    className={cn(
                        "grid grid-cols-[4px_minmax(0,1fr)] gap-3 py-1",
                        className,
                    )}
                >
                    <span className="rounded bg-[#DDDDDD]" />
                    <div className="grid gap-1">
                        <span className="text-[13.5px] font-bold text-[#1D1C1D]">
                            {siteName}
                        </span>
                        <span className="text-[14.5px] font-bold text-[#1264A3] [overflow-wrap:anywhere]">
                            {title}
                        </span>
                        <span className="text-sm leading-[1.45] text-[#1D1C1D]">
                            {descLong}
                        </span>
                        {image ? (
                            <Picture
                                image={image}
                                className="h-[158px] w-[300px] max-w-full rounded-lg"
                            />
                        ) : null}
                    </div>
                </div>
            );
        case "google":
            return (
                <div
                    className={cn(
                        "grid gap-[3px] py-1 [font-family:Arial,sans-serif]",
                        className,
                    )}
                >
                    <div className="flex items-center gap-2.5">
                        <span className="size-[26px] shrink-0 rounded-full border border-[#DADCE0] bg-[#F1F3F4]" />
                        <span className="grid min-w-0">
                            <span className="truncate text-sm text-[#202124]">
                                {siteName}
                            </span>
                            <span className="truncate text-xs text-[#4D5156]">
                                https://{domain}
                            </span>
                        </span>
                    </div>
                    <span className="text-xl leading-[1.3] text-[#1A0DAB] [overflow-wrap:anywhere]">
                        {title}
                    </span>
                    <span className="text-sm leading-[1.55] text-[#4D5156]">
                        {descLong}
                    </span>
                </div>
            );
        case "small":
            return (
                <div
                    className={cn(
                        "grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] border border-[#DADCE0] bg-white p-2.5",
                        className,
                    )}
                >
                    {image ? (
                        <Picture
                            image={image}
                            label={false}
                            className="h-16 rounded-md"
                        />
                    ) : (
                        <div className="h-16 rounded-md bg-[#EDEAE3]" />
                    )}
                    <div className="grid min-w-0 gap-0.5">
                        <span className="truncate text-[13.5px] font-semibold text-[#1C1C1A]">
                            {title}
                        </span>
                        <span className="truncate text-xs text-[#6B665A]">
                            {domain}
                        </span>
                    </div>
                </div>
            );
    }
}
