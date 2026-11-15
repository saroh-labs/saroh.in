import { cn } from "@saroh/marketing/cn";
import type { SiteLook } from "@saroh/marketing/kit/site-drawing";
import { Bookmark, Heart, MessageCircle, Send } from "lucide-react";
import type { ReactNode } from "react";

import type { CardWordsSet } from "@/content/reach-social";

import type { PhotoKind } from "../reach/photo";
import type { PostKind, PostSize } from "./post-card";
import { PostCard } from "./post-card";

export interface LookPair {
    look?: SiteLook;
    band?: { bg: string; fg: string };
}

/** One item's card in one style, its words from the item's set. */
export function ItemCard({
    set,
    look,
    kind,
    photo,
    size,
    flat,
    className,
}: {
    set: CardWordsSet;
    look: LookPair;
    kind: Exclude<PostKind, "text">;
    photo: PhotoKind;
    size?: PostSize;
    flat?: boolean;
    className?: string;
}) {
    if (!look.look) return null;
    const style = {
        photo: "Photo",
        price: "Price tag",
        offer: "Offer",
        simple: "Simple",
    }[kind];
    return (
        <PostCard
            look={look.look}
            band={look.band}
            kind={kind}
            photo={photo}
            size={size}
            flat={flat}
            label={`${set.name}, ${style} post in ${set.label.split(" · ")[0]}'s look`}
            className={className}
            words={{
                label: kind === "offer" ? set.offer.label : set.label,
                name: set.name,
                line:
                    kind === "photo"
                        ? set.photoLine
                        : kind === "simple"
                          ? set.simpleLine
                          : undefined,
                tag: set.tag,
                offer: set.offer,
                mark: set.mark,
                web: set.web,
            }}
        />
    );
}

/** An Instagram post around a card: the handle, the card, the actions, the caption. */
export function Feed({
    handle,
    initials,
    caption,
    inBio,
    children,
    className,
}: {
    handle: string;
    initials: string;
    caption: string;
    inBio: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl bg-card text-foreground",
                className,
            )}
        >
            <div className="flex h-[46px] items-center gap-[9px] px-3 text-[13.5px] font-semibold">
                <span className="flex size-[34px] items-center justify-center rounded-full bg-mk-ledger text-[12px] font-bold text-mk-ledger-fg">
                    {initials}
                </span>
                {handle}
                <span
                    aria-hidden
                    className="ml-auto tracking-[1px] text-muted-foreground"
                >
                    •••
                </span>
            </div>
            {children}
            <div
                aria-hidden
                className="flex gap-3.5 px-3 pb-1 pt-2.5 [&_svg]:size-5"
            >
                <Heart />
                <MessageCircle />
                <Send />
                <Bookmark className="ml-auto" />
            </div>
            <p className="m-0 px-3 pb-3 pt-0.5 text-[13px] leading-[1.45]">
                <b className="mr-1 font-semibold">{handle}</b>
                {caption}{" "}
                <mark className="rounded-[3px] bg-mk-tint px-0.5 text-foreground">
                    {inBio}
                </mark>
            </p>
        </div>
    );
}

/** A status chip on a post's tile: "Shared", or "Draft" in Ink. */
export function StateChip({
    draft,
    children,
}: {
    draft?: boolean;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "absolute left-1 top-1 z-[3] inline-flex h-6 items-center rounded-full px-[9px] text-[12px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
                draft ? "bg-foreground text-background" : "bg-card",
            )}
        >
            {children}
        </span>
    );
}

/** A segmented control as a picture (it changes nothing here). */
export function Seg({ items, on }: { items: readonly string[]; on: number }) {
    return (
        <span className="inline-flex rounded-[10px] bg-mk-hover p-[3px]">
            {items.map((s, i) => (
                <span
                    key={s}
                    className={cn(
                        "flex h-[34px] items-center whitespace-nowrap rounded-lg px-3 text-[13.5px] font-medium text-mk-copy",
                        i === on &&
                            "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(28,28,26,0.14)]",
                    )}
                >
                    {s}
                </span>
            ))}
        </span>
    );
}

/** A time in Share's story (".fs-tm"): mono, on paper. */
export function StoryTime({
    children,
    white,
}: {
    children: ReactNode;
    white?: boolean;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-8 items-center rounded-lg border border-border px-[11px] font-mono text-[14px] font-medium",
                white ? "bg-card" : "bg-mk-hover",
            )}
        >
            {children}
        </span>
    );
}
