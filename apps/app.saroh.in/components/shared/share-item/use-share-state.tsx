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
    HEADLINE_MAX,
    taggedLink,
    withLink,
} from "@/lib/share-item/share";
import type { CaptionKind } from "@/lib/share-item/words";
import { captionFor, captionKinds, SHARE_WORDS } from "@/lib/share-item/words";

import { CaptionBox } from "./caption-box";
import type { PickerCard } from "./card-picker";
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

/** The caption with its chips. */
export function ShareCaption({
    share,
    showLabel,
}: {
    share: ShareState;
    showLabel: boolean;
}) {
    return (
        <CaptionBox
            kinds={share.kinds}
            kind={share.kind}
            onKind={share.pickKind}
            text={share.text}
            onText={share.setText}
            showLabel={showLabel}
        />
    );
}

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
