import { cn } from "../../cn";
import type { SiteLook } from "../../kit/site-drawing";

import type { PhotoKind } from "../reach/photo";
import { Photo } from "../reach/photo";
import { lookStyle } from "../website/shop-site";

/** The four card styles Share draws an item as, and a post of your own. */
export type PostKind = "photo" | "price" | "offer" | "simple" | "text";
export type PostSize = "post" | "square" | "story";

/** A card's words: every one from the item, as the app's card has them. */
export interface PostWords {
    /** "Rye & Co. · Bakery", the small capitals line. */
    label: string;
    name: string;
    /** "₹360 · box of 6" (Photo), "₹360 · fresh every morning" (Simple). */
    line?: string;
    /** The price tag's price and unit. */
    tag?: { price: string; unit?: string };
    /** The offer: "20% off", was and now. */
    offer?: { big: string; was: string; now: string };
    /** The business's initials, on Simple. */
    mark?: string;
    web: string;
}

const ASPECT: Record<PostSize, string> = {
    post: "aspect-[4/5]",
    square: "aspect-square",
    story: "aspect-[9/16]",
};

const HEAD =
    "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)]";
const LAB = "text-[0.55em] font-bold uppercase leading-[1.2] tracking-[0.16em]";

/**
 * A Share card (the boards' `.fc`), drawn in the business's own look: its
 * `--site-*` colours, fonts and corners, never Saroh's. It scales with its
 * width (container units), so the same card reads at 64px and at 330px.
 * `fill` paints a text post in the look's accent or band.
 */
export function PostCard({
    look,
    band,
    kind,
    words,
    photo,
    size = "post",
    fill,
    label,
    flat = false,
    className,
}: {
    look: SiteLook;
    band?: { bg: string; fg: string };
    kind: PostKind;
    words: PostWords;
    photo: PhotoKind;
    size?: PostSize;
    fill?: "accent" | "band";
    label: string;
    /** No corners or shadow: inside a feed's frame. */
    flat?: boolean;
    className?: string;
}) {
    const story = size === "story";
    const filled =
        fill === "accent"
            ? "bg-[hsl(var(--site-accent))] text-[hsl(var(--site-accent-fg))]"
            : fill === "band" || kind === "offer"
              ? "bg-[hsl(var(--site-band))] text-[hsl(var(--site-band-fg))]"
              : "bg-[hsl(var(--site-bg))] text-[hsl(var(--site-fg))]";
    const muted =
        fill || kind === "offer"
            ? "opacity-85"
            : "text-[hsl(var(--site-muted))]";
    return (
        <div
            role="img"
            aria-label={label}
            className={cn("[container-type:inline-size]", className)}
            style={lookStyle(look, band)}
        >
            <div
                className={cn(
                    "relative flex flex-col overflow-hidden font-[family-name:var(--site-font-body)]",
                    ASPECT[size],
                    filled,
                    flat
                        ? "rounded-none"
                        : "rounded-[var(--site-radius)] shadow-[0_6px_18px_rgba(20,14,10,0.18)]",
                )}
                style={{ fontSize: "5.88cqw" }}
            >
                {kind === "photo" ? (
                    <>
                        <Photo kind={photo} className="min-h-0 flex-1" />
                        <div className="flex flex-none flex-col gap-[0.18em] px-[0.95em] pb-[0.8em] pt-[0.7em]">
                            <span
                                className={cn(
                                    LAB,
                                    "text-[hsl(var(--site-accent))]",
                                )}
                            >
                                {words.label}
                            </span>
                            <b
                                className={cn(
                                    HEAD,
                                    "text-[1.35em] leading-[1.08] tracking-[-0.01em]",
                                )}
                            >
                                {words.name}
                            </b>
                            {words.line ? (
                                <span className="text-[0.8em] text-[hsl(var(--site-muted))]">
                                    {words.line}
                                </span>
                            ) : null}
                            <span className="text-[0.55em] tracking-[0.02em] text-[hsl(var(--site-muted))]">
                                {words.web}
                            </span>
                        </div>
                    </>
                ) : kind === "price" ? (
                    <>
                        <Photo kind={photo} className="absolute inset-0" />
                        {words.tag ? (
                            <span
                                className={cn(
                                    HEAD,
                                    "absolute right-[0.8em] z-[2] flex size-[3.7em] -rotate-[8deg] flex-col items-center justify-center rounded-full bg-[hsl(var(--site-accent))] text-[1em] leading-none text-[hsl(var(--site-accent-fg))]",
                                    story ? "top-[14%]" : "top-[0.8em]",
                                )}
                            >
                                {words.tag.price}
                                {words.tag.unit ? (
                                    <small className="mt-[0.25em] font-[family-name:var(--site-font-body)] text-[0.45em] font-medium">
                                        {words.tag.unit}
                                    </small>
                                ) : null}
                            </span>
                        ) : null}
                        <div
                            className={cn(
                                "absolute inset-x-0 z-[2] flex flex-col gap-[0.15em] bg-[hsl(var(--site-ink))] px-[0.95em] py-[0.7em] text-[hsl(var(--site-ink-fg))]",
                                story ? "bottom-[20%]" : "bottom-0",
                            )}
                        >
                            <span
                                className={cn(
                                    LAB,
                                    "text-[color-mix(in_srgb,hsl(var(--site-accent))_55%,white)]",
                                )}
                            >
                                {words.label.split(" · ")[0]}
                            </span>
                            <b
                                className={cn(
                                    HEAD,
                                    "text-[1.35em] leading-[1.08] tracking-[-0.01em]",
                                )}
                            >
                                {words.name}
                            </b>
                            <span className="text-[0.55em] tracking-[0.02em] opacity-85">
                                {words.web}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-[0.45em] p-[0.9em] text-center">
                        {kind === "simple" && words.mark ? (
                            <span className="inline-flex size-[3.2em] flex-none items-center justify-center rounded-full bg-[hsl(var(--site-accent))] text-[0.6em] font-bold text-[hsl(var(--site-accent-fg))]">
                                {words.mark}
                            </span>
                        ) : null}
                        <span
                            className={cn(
                                LAB,
                                kind === "simple"
                                    ? "text-[hsl(var(--site-accent))]"
                                    : muted,
                                kind === "simple" && "hidden",
                            )}
                        >
                            {words.label}
                        </span>
                        {kind === "offer" && words.offer ? (
                            <span
                                className={cn(
                                    HEAD,
                                    "text-[2.5em] leading-[0.95] tracking-[-0.02em]",
                                )}
                            >
                                {words.offer.big}
                            </span>
                        ) : null}
                        {kind === "offer" ? (
                            <Photo
                                kind={photo}
                                className="size-[7.1em] flex-none rounded-full border-[0.22em] border-[hsl(var(--site-surface))]"
                            />
                        ) : null}
                        <b
                            className={cn(
                                HEAD,
                                "leading-[1.08] tracking-[-0.01em]",
                                kind === "offer"
                                    ? "text-[1.5em]"
                                    : kind === "simple"
                                      ? "text-[2.1em]"
                                      : "text-[2.25em]",
                            )}
                        >
                            {words.name}
                        </b>
                        {kind === "offer" && words.offer ? (
                            <span className="text-[0.8em]">
                                <span className="mr-[0.35em] line-through opacity-75">
                                    {words.offer.was}
                                </span>
                                {words.offer.now}
                            </span>
                        ) : words.line ? (
                            <span className={cn("text-[0.8em]", muted)}>
                                {words.line}
                            </span>
                        ) : null}
                        {kind === "simple" ? (
                            <Photo
                                kind={photo}
                                className="size-[6.2em] flex-none rounded-full border-[0.22em] border-[hsl(var(--site-surface))]"
                            />
                        ) : null}
                        <span
                            className={cn(
                                "text-[0.55em] tracking-[0.02em]",
                                muted,
                            )}
                        >
                            {words.web}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
