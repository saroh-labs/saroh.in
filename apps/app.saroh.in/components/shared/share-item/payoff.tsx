"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Check, MessageCircle } from "lucide-react";

import type { CardSize, ScheduleLock } from "@/lib/share-item/share";
import { whatsappHref } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";

import { CardPicture, InstaFrame, PhoneFrame } from "./insta-frame";
import { SocialLine, SocialTease } from "./schedule-lock";
import type { Shared } from "./share-actions";
import type { CardImage } from "./use-card-image";

/** Instagram's own address: on a phone it opens the app. */
export const INSTAGRAM_HREF = "https://www.instagram.com/";

function Done({ children }: { children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-2.5 text-[14.5px]">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-subtle-foreground">
                <Check aria-hidden className="size-3.5" />
            </span>
            {children}
        </li>
    );
}

/**
 * After sharing (boards BDone*, SPayoff*): the post on a phone, what was
 * done (saved, copied), Open Instagram, WhatsApp too, and the way back
 * (`back`: Try another look in the sheet, Make another post on the page).
 * At a desk the "next time" note about Saroh Social sits under it; on a
 * phone one line does.
 */
export function SharePayoff({
    business,
    colour,
    image,
    size,
    name,
    words,
    caption,
    done,
    lock,
    back,
    narrow,
    pinned = false,
    className,
}: {
    business: string;
    colour?: string | null;
    image: CardImage;
    size: CardSize;
    name: string;
    words: string;
    /** The caption as shared, for WhatsApp too. */
    caption: string;
    done: Shared;
    lock: ScheduleLock;
    back: { label: string; onClick: () => void };
    narrow: boolean;
    /** On a page: the phone's buttons stay above the tab bar. */
    pinned?: boolean;
    className?: string;
}) {
    const post = (
        <PhoneFrame>
            <InstaFrame
                business={business}
                colour={colour}
                words={words}
                clamp
                className="rounded-none shadow-none"
                picture={<CardPicture image={image} size={size} name={name} />}
            />
        </PhoneFrame>
    );
    const whatsapp = (label: string) => (
        <Button
            asChild
            variant="outline"
            className="h-11 gap-2 bg-card font-semibold"
        >
            <a
                href={whatsappHref(caption)}
                target="_blank"
                rel="noopener noreferrer"
            >
                <MessageCircle aria-hidden className="size-4" />
                {label}
            </a>
        </Button>
    );
    const open = (
        <Button asChild className="h-11 font-semibold">
            <a href={INSTAGRAM_HREF} target="_blank" rel="noopener noreferrer">
                {SHARE_WORDS.openInstagram}
            </a>
        </Button>
    );
    const backButton = (
        <Button
            type="button"
            variant="outline"
            className="h-11 bg-card font-semibold"
            onClick={back.onClick}
        >
            {back.label}
        </Button>
    );

    if (narrow) {
        return (
            <div
                data-share-payoff=""
                className={cn("flex min-h-full flex-col", className)}
            >
                <div className="flex flex-1 flex-col items-center gap-5 py-4">
                    {post}
                    <h2 className="text-center text-[22px] font-semibold tracking-[-0.01em]">
                        {SHARE_WORDS.readyFor}
                    </h2>
                    <ul className="grid gap-2">
                        {done.copied ? (
                            <Done>{SHARE_WORDS.pasteThere}</Done>
                        ) : null}
                        {done.saved ? (
                            <Done>{SHARE_WORDS.imageSaved}</Done>
                        ) : null}
                    </ul>
                </div>
                <div
                    className={cn(
                        "sticky z-10 -mx-4 grid gap-2 border-t border-border bg-background px-4 pb-3.5 pt-3",
                        pinned ? "bottom-[var(--tab-bar-inset)]" : "bottom-0",
                    )}
                >
                    {open}
                    <div className="grid grid-cols-2 gap-2">
                        {whatsapp(SHARE_WORDS.whatsappToo)}
                        {backButton}
                    </div>
                    <SocialLine
                        lock={lock}
                        words={SHARE_WORDS.postsItForYou}
                        icon="chart"
                        className="text-center"
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            data-share-payoff=""
            className={cn(
                "flex flex-wrap items-center justify-center gap-x-14 gap-y-8",
                className,
            )}
        >
            {post}
            <div className="grid min-w-0 max-w-[560px] flex-1 basis-[360px] gap-4">
                <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em]">
                    {SHARE_WORDS.readyFor}
                </h2>
                <ul className="grid gap-3">
                    {done.saved ? <Done>{SHARE_WORDS.imageSaved}</Done> : null}
                    {done.copied ? (
                        <Done>{SHARE_WORDS.captionCopied}</Done>
                    ) : null}
                </ul>
                <p className="text-[14px] leading-[1.6] text-muted-foreground">
                    {SHARE_WORDS.payoffHow}
                </p>
                <div className="flex flex-wrap gap-2">
                    {open}
                    {whatsapp(SHARE_WORDS.alsoWhatsapp)}
                    {backButton}
                </div>
                <SocialTease lock={lock} />
            </div>
        </div>
    );
}
