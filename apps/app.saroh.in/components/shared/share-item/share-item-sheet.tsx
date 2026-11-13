"use client";

import { Button } from "@saroh/ui/button";
import { FormSheet, FormSheetBody } from "@saroh/ui/form-sheet";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type {
    CardSize,
    CardStyle,
    ShareItem,
    ShareSetup,
} from "@/lib/share-item/share";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";

import { PROFILE } from "@/lib/edition";
import {
    BOOK_HEADLINE,
    cardFileName,
    cardImageUrl,
    cardsFor,
    HEADLINE_MAX,
    taggedLink,
    withLink,
} from "@/lib/share-item/share";
import type { CaptionKind } from "@/lib/share-item/words";
import { captionFor, captionKinds, SHARE_WORDS } from "@/lib/share-item/words";

import { CaptionBox } from "./caption-box";
import {
    CardCarousel,
    CardPreview,
    CardRow,
    PictureFailed,
    SizeSwitch,
} from "./card-picker";
import { ColourRow } from "./colour-row";
import {
    DeskSchedule,
    ScheduleButton,
    ScheduleLine,
    SocialOffer,
} from "./schedule-lock";
import type { ShareParts } from "./share-actions";
import { DeskActions, ShareNowButton } from "./share-actions";
import { useCardImage } from "./use-card-image";

/**
 * Share as a post (#1375 U2, boards SFBDesk and SFBPhone): "Share" beside
 * the QR button on a live product or service, in a live blog post's header
 * (SGShareBlog*), and on the booking page's row. Free on every plan.
 *
 * The caller draws it only for a live item, with the live site read
 * (`readShareSetup`): nothing to share is no button, never a broken one.
 */
export function ShareItemButton({
    item,
    setup,
    className,
}: {
    item: ShareItem;
    setup: ShareSetup;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <FormSheet
            open={open}
            trigger={
                <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    data-share-item={item.kind}
                    className={cn("gap-1.5 font-medium", className)}
                >
                    <Share2 aria-hidden className="size-3.5" />
                    Share
                </Button>
            }
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            title={`Share ${item.name}`}
            description={SHARE_WORDS.subtitle(item)}
            // Nothing here is saved: closing never asks.
            dirty={false}
            bottomOnPhone
            className="sm:max-w-[740px]"
        >
            <ShareBody item={item} setup={setup} />
        </FormSheet>
    );
}

/**
 * The sheet's inside, mounted only while it is open, so the picture is
 * fetched then. Its parts (`CardRow`, `CardCarousel`, `CaptionBox`, the
 * actions) are what Create post reuses.
 */
function ShareBody({ item, setup }: { item: ShareItem; setup: ShareSetup }) {
    const narrow = useNarrow();
    const cards = cardsFor(item);
    const [style, setStyle] = useState<CardStyle>(
        cards.includes("price") && item.price !== null
            ? "price"
            : (cards[0] ?? "photo"),
    );
    const [size, setSize] = useState<CardSize>("post");
    // The booking page's headline, typed here and never stored.
    const [headline, setHeadline] = useState(BOOK_HEADLINE);
    const [bg, setBg] = useState<string | null>(null);
    // Each picture is a render: wait for typing or a colour drag to settle.
    const look = useSettled({ bg, headline }, 500);
    const link = taggedLink(item.url);
    const named =
        item.kind === "book"
            ? { ...item, name: headline.trim() || BOOK_HEADLINE }
            : item;
    const kinds = captionKinds(item, PROFILE.hinglishCaptions);
    const [kind, setKind] = useState<CaptionKind>(
        kinds.includes("price") ? "price" : "short",
    );
    const [text, setText] = useState(() => captionFor(kind, named, link));
    const [copiedNote, setCopiedNote] = useState(false);
    const [offer, setOffer] = useState(false);
    const offerRef = useRef<HTMLDivElement | null>(null);

    const src = (s: CardStyle, w?: number) =>
        cardImageUrl(setup, item, s, size, { ...look, w });
    const { image, retry } = useCardImage(src(style));
    const parts: ShareParts = {
        caption: withLink(text, link),
        link,
        image,
        fileName: cardFileName(named, style, size),
    };
    const pickKind = (k: CaptionKind) => {
        setKind(k);
        setText(captionFor(k, named, link));
    };
    // Thumbnails at twice the size they show: a small render, not a full one.
    const picker = cards.map((s) => ({
        style: s,
        src: src(s, narrow ? 480 : 240),
    }));
    const extras = (
        <>
            {item.kind === "book" ? (
                <Field label={SHARE_WORDS.headline}>
                    <Input
                        value={headline}
                        maxLength={HEADLINE_MAX}
                        onChange={(e) => setHeadline(e.target.value)}
                        data-share-headline=""
                    />
                </Field>
            ) : null}
            <ColourRow
                swatches={setup.swatches ?? []}
                value={bg}
                onChange={setBg}
            />
        </>
    );

    // The phone's offer opens under the caption, scrolled to.
    useEffect(() => {
        if (offer && narrow) {
            offerRef.current?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        }
    }, [offer, narrow]);

    const caption = (
        <CaptionBox
            kinds={kinds}
            kind={kind}
            onKind={pickKind}
            text={text}
            onText={setText}
            showLabel={!narrow}
        />
    );

    if (narrow) {
        return (
            <>
                <FormSheetBody className="gap-4">
                    {copiedNote ? (
                        <Notice tone="success">{SHARE_WORDS.pasteIt}</Notice>
                    ) : null}
                    {image.state === "failed" ? (
                        <PictureFailed
                            onRetry={retry}
                            className="mx-auto w-full max-w-[260px]"
                        />
                    ) : (
                        <CardCarousel
                            cards={picker}
                            style={style}
                            onStyle={setStyle}
                            size={size}
                            image={image}
                            name={item.name}
                        />
                    )}
                    <SizeSwitch size={size} onSize={setSize} block />
                    {extras}
                    {caption}
                    {offer ? (
                        <div
                            ref={offerRef}
                            className="rounded-xl border border-border bg-card p-4"
                        >
                            <SocialOffer
                                lock={setup.schedule}
                                onClose={() => setOffer(false)}
                            />
                        </div>
                    ) : null}
                </FormSheetBody>
                <div className="mt-3 grid gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                        <ShareNowButton
                            {...parts}
                            onCopied={() => setCopiedNote(true)}
                        />
                        <ScheduleButton
                            aria-expanded={offer}
                            onClick={() => setOffer((o) => !o)}
                        />
                    </div>
                    <p className="text-center text-[12.5px] text-muted-foreground">
                        {SHARE_WORDS.copiedFirst}
                    </p>
                    <ScheduleLine lock={setup.schedule} phone />
                </div>
            </>
        );
    }

    return (
        <>
            <FormSheetBody className="gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[14px] font-semibold">
                        {SHARE_WORDS.pick}
                    </h3>
                    <SizeSwitch size={size} onSize={setSize} />
                </div>
                <CardRow
                    cards={picker}
                    style={style}
                    onStyle={setStyle}
                    size={size}
                    failed={image.state === "failed"}
                />
                {extras}
                <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                    <CardPreview
                        image={image}
                        size={size}
                        name={item.name}
                        onRetry={retry}
                    />
                    {caption}
                </div>
                <DeskActions {...parts} />
            </FormSheetBody>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <div className="min-w-0 flex-1">
                    <ScheduleLine lock={setup.schedule} />
                </div>
                <DeskSchedule
                    lock={setup.schedule}
                    open={offer}
                    onOpenChange={setOffer}
                />
            </div>
        </>
    );
}

/** `value`, once it has stayed the same for `ms`. */
function useSettled<T>(value: T, ms: number): T {
    const [settled, setSettled] = useState(value);
    const key = JSON.stringify(value);
    useEffect(() => {
        const t = setTimeout(() => setSettled(JSON.parse(key) as T), ms);
        return () => clearTimeout(t);
    }, [key, ms]);
    return settled;
}
