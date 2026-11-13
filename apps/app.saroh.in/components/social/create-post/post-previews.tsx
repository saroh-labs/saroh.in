"use client";

import { Skeleton } from "@saroh/ui/skeleton";

import type { CardImage } from "@/components/shared/share-item/use-card-image";
import { initialsOf } from "@/lib/qr/pick";
import { shownAddress } from "@/lib/social/links";
import { POST_WORDS } from "@/lib/social/words";

/**
 * How it looks when you share it (SFCLockedDesk): the card and caption as
 * an Instagram post, a Facebook post and a Threads post would show them.
 * Close, not exact: each app crops a little, and the page says so.
 */
export function PostPreviews({
    image,
    caption,
    link,
    business,
}: {
    image: CardImage;
    caption: string;
    link: string;
    business: string;
}) {
    const words = caption.replace(link, "").trim();
    const picture =
        image.state === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element -- the fetched PNG, as a blob
            <img src={image.src} alt="" className="w-full" />
        ) : (
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
        );
    const who = (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
            {initialsOf(business)}
        </span>
    );
    const frame =
        "overflow-hidden rounded-[10px] border border-border bg-card text-[12.5px] leading-[1.45]";
    return (
        <section aria-label={POST_WORDS.howItLooks} className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold">
                    {POST_WORDS.howItLooks}
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                    {POST_WORDS.howItLooksNote}
                </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3" data-ph-mask="">
                <figure className="grid content-start gap-1.5">
                    <figcaption className="text-[12.5px] font-semibold">
                        Instagram post
                    </figcaption>
                    <div className={frame}>
                        <p className="flex items-center gap-2 p-2.5 font-semibold">
                            {who}
                            {business}
                        </p>
                        {picture}
                        <p className="line-clamp-3 p-2.5">
                            <span className="font-semibold">{business}</span>{" "}
                            {words}{" "}
                            <span className="text-muted-foreground">
                                {POST_WORDS.linkInBio}
                            </span>
                        </p>
                    </div>
                </figure>
                <figure className="grid content-start gap-1.5">
                    <figcaption className="text-[12.5px] font-semibold">
                        Facebook
                    </figcaption>
                    <div className={frame}>
                        <p className="flex items-center gap-2 p-2.5">
                            {who}
                            <span>
                                <span className="block font-semibold">
                                    {business}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                    {POST_WORDS.justNow}
                                </span>
                            </span>
                        </p>
                        <p className="line-clamp-3 px-2.5 pb-2.5">{words}</p>
                        {picture}
                        <p className="truncate bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
                            {shownAddress(link).split("/")[0]?.toUpperCase()}
                        </p>
                    </div>
                </figure>
                <figure className="grid content-start gap-1.5">
                    <figcaption className="text-[12.5px] font-semibold">
                        Threads
                    </figcaption>
                    <div className={frame}>
                        <p className="flex items-center gap-2 p-2.5 font-semibold">
                            {who}
                            {business}
                        </p>
                        <p className="line-clamp-3 px-2.5 pb-2.5">
                            {words} {shownAddress(link)}
                        </p>
                        <div className="px-2.5 pb-2.5">
                            <div className="overflow-hidden rounded-[8px]">
                                {picture}
                            </div>
                        </div>
                    </div>
                </figure>
            </div>
        </section>
    );
}
