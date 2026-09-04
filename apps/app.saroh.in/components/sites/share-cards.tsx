"use client";

import { cn } from "@saroh/ui/lib/utils";

/**
 * What a shared link looks like on each platform, drawn from the four facts
 * every one of them reads: title, description, image, domain (#220).
 *
 * THESE ARE DRAWINGS, NOT FETCHES. Facebook, LinkedIn, WhatsApp, Slack and X
 * only fetch a public URL, so nothing can show a merchant the real card before
 * the site is published — and after it is, each platform caches what it saw
 * for days. A local rendering from the same fields is the only preview that
 * exists at the moment the merchant is typing, which is the moment the fields
 * are being decided. The copy says so, and the two inspector links below the
 * cards are how to bust the cache once the site is live.
 *
 * Instagram is listed and not drawn: it does not unfurl links in captions,
 * bios or most messages. Drawing a card for it would be the one dishonest
 * thing on the screen.
 */

export interface ShareImageFacts {
    url: string;
    width?: number | null;
    height?: number | null;
    bytes?: number | null;
}

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

/** Facebook and LinkedIn crop to this; smaller pictures are shown, but blurred or boxed. */
export const SHARE_IMAGE_MIN = { width: 1200, height: 630 } as const;
/** Above this WhatsApp stops drawing the large picture and falls back to a thumbnail, or nothing. */
export const WHATSAPP_MAX_BYTES = 300 * 1024;

/**
 * The address as something an <img> may be pointed at, or null.
 *
 * The api accepts only http(s) for the share image (#227); this is the same
 * rule on the client, applied before a pasted string that has not been saved
 * yet reaches a `src`. React escapes the attribute, so nothing here was
 * exploitable — but a `javascript:` or `data:` value would have drawn a broken
 * picture and a misleading card, and the rule belongs at every sink, not only
 * the one that persists.
 */
export function webImageUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
}

/**
 * Everything the merchant should know about the picture before they share,
 * with the limit in the sentence. Exported so the rules can be read in one
 * place; the component draws them.
 */
export function shareImageWarnings(image: ShareImageFacts | null): string[] {
    if (!image) {
        return [
            "No share image yet. Without one, WhatsApp, Slack and X show the link as text.",
        ];
    }
    const out: string[] = [];
    const { width, height, bytes } = image;
    if (width && height) {
        if (width < SHARE_IMAGE_MIN.width || height < SHARE_IMAGE_MIN.height) {
            out.push(
                `Facebook and LinkedIn want at least ${SHARE_IMAGE_MIN.width}×${SHARE_IMAGE_MIN.height}. This picture is ${width}×${height}, so they will show it small or blurred.`,
            );
        }
        const ratio = width / height;
        if (ratio < 1.6 || ratio > 2.2) {
            out.push(
                `Cards are cut to about 1.91:1. This picture is ${ratio.toFixed(2)}:1, so the top and bottom or the sides will be cropped.`,
            );
        }
    }
    if (bytes && bytes > WHATSAPP_MAX_BYTES) {
        out.push(
            `WhatsApp drops the large picture for files over ${Math.round(WHATSAPP_MAX_BYTES / 1024)} KB. This one is ${Math.round(bytes / 1024)} KB.`,
        );
    }
    return out;
}

/** The two places that will refetch a cached card, keyed by the live URL. */
export function inspectorLinks(
    liveUrl: string,
): { label: string; href: string }[] {
    const q = encodeURIComponent(liveUrl);
    return [
        {
            label: "Facebook Sharing Debugger",
            href: `https://developers.facebook.com/tools/debug/?q=${q}`,
        },
        {
            label: "LinkedIn Post Inspector",
            href: `https://www.linkedin.com/post-inspector/inspect/${q}`,
        },
    ];
}

function Picture({
    image,
    className,
    alt = "",
}: {
    image: ShareImageFacts | null;
    className?: string;
    alt?: string;
}) {
    const src = image ? webImageUrl(image.url) : null;
    if (!src) {
        return (
            <div
                aria-hidden
                className={cn(
                    "flex items-center justify-center bg-muted text-[10px] uppercase tracking-wide text-muted-foreground",
                    className,
                )}
            >
                no image
            </div>
        );
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL, not a project asset
        <img
            src={src}
            alt={alt}
            className={cn("bg-muted object-cover", className)}
        />
    );
}

function Frame({
    name,
    note,
    children,
}: {
    name: string;
    note?: string;
    children: React.ReactNode;
}) {
    return (
        <figure className="min-w-0">
            <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">{name}</span>
                {note ? (
                    <span className="truncate text-muted-foreground">
                        {note}
                    </span>
                ) : null}
            </figcaption>
            {children}
        </figure>
    );
}

/** The one-line description each platform shows, or nothing. */
function line(text: string, fallback: string | null = null) {
    return text.trim() || fallback;
}

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
    const desc = line(description);
    // WhatsApp's large card needs dimensions and a small file; otherwise it
    // draws a square thumbnail beside the text, which is the version most
    // merchants actually see and never understand why.
    const whatsappLarge =
        !!image &&
        !!image.width &&
        !!image.height &&
        (!image.bytes || image.bytes <= WHATSAPP_MAX_BYTES);
    const warnings = shareImageWarnings(image);

    return (
        <div className={cn("space-y-4", className)}>
            <div className="grid gap-4 sm:grid-cols-2">
                <Frame name="Facebook">
                    <div className="overflow-hidden rounded border bg-background text-[13px] leading-snug">
                        <Picture
                            image={image}
                            className="aspect-[1.91/1] w-full"
                        />
                        <div className="space-y-0.5 border-t bg-muted/60 px-3 py-2">
                            <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                                {host}
                            </div>
                            <div className="line-clamp-2 font-semibold">
                                {title}
                            </div>
                            {desc ? (
                                <div className="line-clamp-1 text-muted-foreground">
                                    {desc}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </Frame>

                <Frame name="LinkedIn">
                    <div className="overflow-hidden rounded border bg-background text-[13px] leading-snug">
                        <Picture
                            image={image}
                            className="aspect-[1.91/1] w-full"
                        />
                        <div className="space-y-0.5 px-3 py-2">
                            <div className="line-clamp-2 font-semibold">
                                {title}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                                {host}
                            </div>
                        </div>
                    </div>
                </Frame>

                <Frame
                    name="WhatsApp"
                    note={
                        image && !whatsappLarge
                            ? "small thumbnail — see below"
                            : undefined
                    }
                >
                    <div className="rounded-lg bg-[#e7ffdb] p-1.5 text-[13px] leading-snug text-neutral-900 dark:bg-[#1f3b2a] dark:text-neutral-100">
                        <div className="overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
                            {whatsappLarge ? (
                                <>
                                    <Picture
                                        image={image}
                                        className="aspect-[1.91/1] w-full"
                                    />
                                    <div className="space-y-0.5 px-2.5 py-1.5">
                                        <div className="line-clamp-2 font-semibold">
                                            {title}
                                        </div>
                                        {desc ? (
                                            <div className="line-clamp-2 opacity-80">
                                                {desc}
                                            </div>
                                        ) : null}
                                        <div className="truncate text-[11px] opacity-60">
                                            {host}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex gap-2.5 p-2">
                                    <Picture
                                        image={image}
                                        className="size-14 shrink-0 rounded"
                                    />
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="line-clamp-2 font-semibold">
                                            {title}
                                        </div>
                                        {desc ? (
                                            <div className="line-clamp-2 opacity-80">
                                                {desc}
                                            </div>
                                        ) : null}
                                        <div className="truncate text-[11px] opacity-60">
                                            {host}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="truncate px-1.5 pt-1.5 text-[13px] text-[#0a7cff]">
                            https://{host}
                        </div>
                    </div>
                </Frame>

                <Frame name="Slack">
                    <div className="flex gap-3 rounded border bg-background p-3 text-[13px] leading-snug">
                        <div className="w-1 shrink-0 rounded bg-muted-foreground/40" />
                        <div className="min-w-0 space-y-1">
                            <div className="truncate text-xs font-semibold">
                                {siteName}
                            </div>
                            <div className="line-clamp-2 font-semibold text-[#1264a3] dark:text-[#5aa0ff]">
                                {title}
                            </div>
                            {desc ? (
                                <div className="line-clamp-2">{desc}</div>
                            ) : null}
                            {image ? (
                                <Picture
                                    image={image}
                                    className="mt-1 aspect-[1.91/1] w-4/5 max-w-[360px] rounded"
                                />
                            ) : null}
                        </div>
                    </div>
                </Frame>

                <Frame name="X">
                    <div className="relative overflow-hidden rounded-2xl border bg-background text-[13px]">
                        {image ? (
                            <>
                                <Picture
                                    image={image}
                                    className="aspect-[1.91/1] w-full"
                                />
                                <div className="absolute bottom-2 left-2 max-w-[90%] truncate rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                                    {title}
                                </div>
                            </>
                        ) : (
                            <div className="flex gap-3 p-3">
                                <Picture
                                    image={null}
                                    className="size-16 shrink-0 rounded-lg"
                                />
                                <div className="min-w-0 space-y-0.5">
                                    <div className="truncate text-muted-foreground">
                                        {host}
                                    </div>
                                    <div className="line-clamp-2 font-semibold">
                                        {title}
                                    </div>
                                    {desc ? (
                                        <div className="line-clamp-2 text-muted-foreground">
                                            {desc}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </div>
                    {image ? (
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                            From {host}
                        </div>
                    ) : null}
                </Frame>

                <Frame name="Instagram">
                    <div className="rounded border border-dashed p-3 text-[13px] leading-snug text-muted-foreground">
                        Instagram shows the link as text. It does not unfurl
                        links in captions, bios or most messages, so there is no
                        card to design.
                    </div>
                </Frame>
            </div>

            {warnings.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                    {warnings.map((w) => (
                        <li key={w} className="flex gap-2">
                            <span aria-hidden className="text-amber-600">
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
                                    className="underline underline-offset-2 hover:text-foreground"
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
