"use client";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { useEffect, useState } from "react";

import { PROFILE } from "@/lib/edition";
import type {
    CardSize,
    CardStyle,
    ShareItem,
    ShareSetup,
} from "@/lib/share-item/share";
import {
    BOOK_HEADLINE,
    cardFileName,
    cardImageUrl,
    cardsFor,
    firstStyle,
    HEADLINE_MAX,
    withLink,
} from "@/lib/share-item/share";
import type { CaptionKind } from "@/lib/share-item/words";
import {
    CAPTION_NAMES,
    captionFor,
    captionKinds,
    SHARE_WORDS,
} from "@/lib/share-item/words";

import { CaptionBox } from "./caption-box";
import type { PickerCard } from "./card-picker";
import { CardRow, SizeSwitch } from "./card-picker";
import { ColourRow } from "./colour-row";
import type { ShareParts } from "./share-actions";
import { useCardImage } from "./use-card-image";

/**
 * What one live item's share is while it is being made (#1375, #1378):
 * the card, its size and colours, the booking page's headline, and the
 * caption. The Share sheet and Create post both run on it, so the two
 * can't drift. Keyed by the item at the caller: a new item starts fresh.
 */
export function useShareState(
    item: ShareItem,
    setup: ShareSetup,
    narrow: boolean,
) {
    const cards = cardsFor(item);
    const [style, setStyle] = useState<CardStyle>(firstStyle(item));
    const [size, setSize] = useState<CardSize>("post");
    // The booking page's headline, typed here and never stored.
    const [headline, setHeadline] = useState(BOOK_HEADLINE);
    const [bg, setBg] = useState<string | null>(null);
    // Each picture is a render: wait for typing or a colour drag to settle.
    const look = useSettled({ bg, headline }, 500);
    const link = item.url;
    const named =
        item.kind === "book"
            ? { ...item, name: headline.trim() || BOOK_HEADLINE }
            : item;
    const kinds = captionKinds(item, PROFILE.hinglishCaptions);
    const [kind, setKind] = useState<CaptionKind>(
        kinds.includes("price") ? "price" : "short",
    );
    const [text, setText] = useState(() => captionFor(kind, named));

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
        setText(captionFor(k, named));
    };
    // Thumbnails at twice the size they show: a small render, not a full one.
    const picker: PickerCard[] = cards.map((s) => ({
        style: s,
        src: src(s, narrow ? 480 : 240),
    }));
    return {
        style,
        setStyle,
        size,
        setSize,
        headline,
        setHeadline,
        bg,
        setBg,
        kinds,
        kind,
        pickKind,
        text,
        setText,
        image,
        retry,
        parts,
        picker,
    };
}

export type ShareState = ReturnType<typeof useShareState>;

/** The booking page's headline, and the colour row. */
export function ShareExtras({
    item,
    setup,
    share,
}: {
    item: ShareItem;
    setup: ShareSetup;
    share: ShareState;
}) {
    return (
        <>
            {item.kind === "book" ? (
                <Field label={SHARE_WORDS.headline}>
                    <Input
                        value={share.headline}
                        maxLength={HEADLINE_MAX}
                        onChange={(e) => share.setHeadline(e.target.value)}
                        data-share-headline=""
                    />
                </Field>
            ) : null}
            <ColourRow
                swatches={setup.swatches ?? []}
                value={share.bg}
                onChange={share.setBg}
            />
        </>
    );
}

/** The caption with its chips and its link. */
export function ShareCaption({
    share,
    onDone,
    phone,
    className,
}: {
    share: ShareState;
    onDone?: () => void;
    phone?: boolean;
    className?: string;
}) {
    return (
        <CaptionBox
            kinds={share.kinds}
            kind={share.kind}
            onKind={share.pickKind}
            text={share.text}
            onText={share.setText}
            link={share.parts.link}
            onDone={onDone}
            phone={phone}
            className={className}
        />
    );
}

/**
 * "Try another look" (BPostDesk, SBShareDesk): the size, the ready cards
 * small, and the colours (and the booking page's headline), all at once.
 */
export function LookPicker({
    item,
    setup,
    share,
    className,
}: {
    item: ShareItem;
    setup: ShareSetup;
    share: ShareState;
    className?: string;
}) {
    return (
        <section
            aria-label={SHARE_WORDS.tryLook}
            data-look-picker=""
            className={className}
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold">
                    {SHARE_WORDS.tryLook}
                </h3>
                <SizeSwitch size={share.size} onSize={share.setSize} />
            </div>
            <CardRow
                cards={share.picker}
                style={share.style}
                onStyle={share.setStyle}
                size={share.size}
                failed={share.image.state === "failed"}
            />
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
                <ShareExtras item={item} setup={setup} share={share} />
            </div>
        </section>
    );
}

/** The caption's start, named: "Caption · With price". */
export const captionTitle = (share: ShareState) =>
    `${SHARE_WORDS.caption} · ${CAPTION_NAMES[share.kind]}`;

/** `value`, once it has stayed the same for `ms`. */
export function useSettled<T>(value: T, ms: number): T {
    const [settled, setSettled] = useState(value);
    const key = JSON.stringify(value);
    useEffect(() => {
        const t = setTimeout(() => setSettled(JSON.parse(key) as T), ms);
        return () => clearTimeout(t);
    }, [key, ms]);
    return settled;
}
