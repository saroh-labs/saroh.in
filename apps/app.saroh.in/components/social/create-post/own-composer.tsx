"use client";

import { RadioCards } from "@saroh/ui/choice-group";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Segmented } from "@saroh/ui/segmented";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { TextLink } from "@saroh/ui/text-link";
import { Textarea } from "@saroh/ui/textarea";
import { ImageIcon, Link2, Type } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { PickedImage } from "@/components/shared/fields/media-picker";
import { MediaPicker } from "@/components/shared/fields/media-picker";
import {
    CardCarousel,
    CardPreview,
    CardRow,
    SizeSwitch,
} from "@/components/shared/share-item/card-picker";
import { ChannelsLocked } from "@/components/shared/share-item/schedule-lock";
import type { ShareParts } from "@/components/shared/share-item/share-actions";
import { useCardImage } from "@/components/shared/share-item/use-card-image";
import { useSettled } from "@/components/shared/share-item/use-share-state";
import type {
    CardSize,
    CardStyle,
    ShareItem,
    ShareSetup,
} from "@/lib/share-item/share";
import {
    cardFileName,
    cardImageUrl,
    cardsFor,
    HEADLINE_MAX,
    taggedLink,
    withLink,
} from "@/lib/share-item/share";
import { saveOwnPost } from "@/lib/social/actions";
import type { LinkChoice } from "@/lib/social/links";
import { addressOf, shownAddress } from "@/lib/social/links";
import type { OwnPost, OwnPostInput } from "@/lib/social/own-posts";
import { counted, POST_WORDS } from "@/lib/social/words";

/** Instagram's cap on a caption, as the API holds it. */
export const CAPTION_MAX = 2200;
/** How long typing settles before it is saved. */
export const SAVE_AFTER_MS = 800;

const A_PAGE = "page";

/**
 * Your own post (SGOwnDesk, SGOwnPhone): your own photo or text only, a
 * headline, the cards for it, a caption and where the link goes. Saved to
 * the business's posts as it is written (`share-posts`), which is what
 * lets its picture be drawn: the cards show once it is saved.
 */
export function OwnComposer({
    mode: startMode,
    setup,
    origin,
    fixedLinks,
    pageLinks,
    narrow,
    onPickInstead,
    renderFoot,
}: {
    mode: "photo" | "text";
    setup: ShareSetup;
    /** The live site's address. */
    origin: string;
    fixedLinks: readonly LinkChoice[];
    pageLinks: readonly LinkChoice[];
    narrow: boolean;
    onPickInstead: () => void;
    renderFoot: (parts: ShareParts, note: React.ReactNode) => React.ReactNode;
}) {
    const id = useId();
    const [mode, setMode] = useState(startMode);
    const [photo, setPhoto] = useState<PickedImage | null>(null);
    const [headline, setHeadline] = useState("");
    const [caption, setCaption] = useState("");
    const [linkPath, setLinkPath] = useState(fixedLinks[0]?.path ?? "/");
    const [style, setStyle] = useState<CardStyle>("colour");
    const [size, setSize] = useState<CardSize>("post");
    const [post, setPost] = useState<OwnPost | null>(null);
    const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
    const [error, setError] = useState<string | null>(null);

    const mediaId = mode === "photo" ? (photo?.mediaId ?? null) : null;
    const input: OwnPostInput = {
        headline: headline.trim() || null,
        mediaId,
        caption,
        linkPath,
        style,
        size,
    };
    const settled = useSettled(input, SAVE_AFTER_MS);
    const ready = settled.headline != null || settled.mediaId != null;

    // One save at a time, in order: the first makes the post, the rest change it.
    const chain = useRef<Promise<unknown>>(Promise.resolve());
    const postId = useRef<string | null>(null);
    const lastSaved = useRef<string | null>(null);
    const key = JSON.stringify(settled);
    useEffect(() => {
        if (!ready || key === lastSaved.current) return;
        lastSaved.current = key;
        const body = JSON.parse(key) as OwnPostInput;
        chain.current = chain.current.then(async () => {
            setStatus("saving");
            try {
                const res = await saveOwnPost(postId.current, body);
                if (res.ok) {
                    postId.current = res.data.id;
                    setPost(res.data);
                    setStatus("idle");
                    setError(null);
                } else {
                    setStatus("failed");
                    setError(res.error);
                    // Try again with the next change.
                    lastSaved.current = null;
                }
            } catch {
                setStatus("failed");
                setError(POST_WORDS.notSaved);
                lastSaved.current = null;
            }
        });
    }, [key, ready]);

    const url = addressOf(origin, post?.linkPath ?? linkPath);
    const item: ShareItem = {
        kind: "own",
        ref: post?.id ?? "",
        name: post?.headline ?? (headline.trim() || POST_WORDS.ownTitle),
        price: null,
        url,
        offerId: null,
        hasPhoto: Boolean(post?.mediaId),
    };
    const cards = cardsFor(item);
    const shownStyle = cards.includes(style) ? style : "colour";
    const src = (s: CardStyle, w?: number) =>
        post
            ? cardImageUrl(setup, item, s, size, { w, v: post.updatedAt })
            : null;
    const { image, retry } = useCardImage(src(shownStyle));
    const link = taggedLink(url, post?.id);
    const parts: ShareParts = {
        caption: withLink(caption, link),
        link,
        image,
        fileName: cardFileName(item, shownStyle, size),
    };
    const picker = post
        ? cards.map((s) => ({
              style: s,
              src: src(s, narrow ? 480 : 240) ?? "",
          }))
        : [];

    const note =
        status === "saving"
            ? POST_WORDS.saving
            : status === "failed"
              ? null
              : POST_WORDS.saved;

    const picture = (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3 max-sm:hidden">
                <h2 className="text-[14px] font-semibold">
                    {POST_WORDS.picture}
                </h2>
                <TextLink onClick={onPickInstead} className="font-semibold">
                    {POST_WORDS.pickInstead}
                </TextLink>
            </div>
            <Segmented
                label={POST_WORDS.picture}
                options={[
                    {
                        value: "photo",
                        label: POST_WORDS.yourPhoto,
                        icon: <ImageIcon aria-hidden />,
                    },
                    {
                        value: "text",
                        label: POST_WORDS.textOnly,
                        icon: <Type aria-hidden />,
                    },
                ]}
                value={mode}
                onValueChange={setMode}
                block
                size="md"
            />
            {mode === "photo" ? (
                <div className="flex items-center gap-3" data-own-photo="">
                    {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the photo just uploaded to the library
                        <img
                            src={photo.src}
                            alt=""
                            className="size-12 shrink-0 rounded-[8px] object-cover"
                        />
                    ) : null}
                    {photo ? (
                        <span className="min-w-0 flex-1">
                            <span
                                data-ph-mask=""
                                className="block truncate text-[14px] font-semibold"
                            >
                                {photo.filename ?? POST_WORDS.yourPhoto}
                            </span>
                            <span className="block text-[12.5px] text-muted-foreground">
                                {POST_WORDS.fromPhotos}
                            </span>
                        </span>
                    ) : null}
                    <MediaPicker
                        onPick={setPhoto}
                        label={
                            photo ? POST_WORDS.change : POST_WORDS.choosePhoto
                        }
                        className={photo ? undefined : "w-full"}
                    />
                </div>
            ) : null}
            <Field label={POST_WORDS.headline} hint={POST_WORDS.headlineHint}>
                <Input
                    value={headline}
                    maxLength={HEADLINE_MAX}
                    onChange={(e) => setHeadline(e.target.value)}
                    data-own-headline=""
                />
            </Field>
            <p
                aria-live="polite"
                className="-mt-1 text-right text-[12px] tabular-nums text-muted-foreground"
            >
                {counted(Array.from(headline).length, HEADLINE_MAX)}
            </p>
        </section>
    );

    const captionBox = (
        <section className="grid gap-1 rounded-xl border border-border bg-card p-4">
            <Field label={POST_WORDS.caption}>
                <Textarea
                    value={caption}
                    maxLength={CAPTION_MAX}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={4}
                    className="text-[14px] leading-[1.5]"
                    data-own-caption=""
                />
            </Field>
            <p className="text-right text-[12px] tabular-nums text-muted-foreground">
                {counted(caption.length, CAPTION_MAX)}
            </p>
        </section>
    );

    const pageChosen = pageLinks.find((p) => p.path === linkPath);
    const linkBox = (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
            <h2
                id={`${id}-link`}
                className="flex items-center gap-2 text-[14px] font-semibold"
            >
                <Link2 aria-hidden className="size-4" />
                {POST_WORDS.link}
            </h2>
            <RadioCards
                labelledBy={`${id}-link`}
                options={[
                    ...fixedLinks.map((c) => ({
                        value: c.value,
                        label: c.label,
                        aside: (
                            <span className="font-mono text-[12px]">
                                {shownAddress(addressOf(origin, c.path))}
                            </span>
                        ),
                    })),
                    ...(pageLinks.length > 0
                        ? [{ value: A_PAGE, label: POST_WORDS.aPage }]
                        : []),
                ]}
                value={
                    pageChosen
                        ? A_PAGE
                        : (fixedLinks.find((c) => c.path === linkPath)?.value ??
                          null)
                }
                onChange={(v) => {
                    if (v === A_PAGE) {
                        setLinkPath(pageLinks[0]?.path ?? "/");
                        return;
                    }
                    const c = fixedLinks.find((f) => f.value === v);
                    if (c) setLinkPath(c.path);
                }}
            />
            {pageChosen ? (
                <div className="grid gap-1.5" data-link-page="">
                    <Select
                        value={pageChosen.value}
                        onValueChange={(v) => {
                            const p = pageLinks.find((x) => x.value === v);
                            if (p) setLinkPath(p.path);
                        }}
                    >
                        <SelectTrigger aria-label={POST_WORDS.choosePage}>
                            <SelectValue placeholder={POST_WORDS.choosePage}>
                                {pageChosen.label}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {pageLinks.map((p) => (
                                <SelectItem key={p.value} value={p.value}>
                                    {p.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="font-mono text-[12px] text-muted-foreground">
                        {shownAddress(addressOf(origin, pageChosen.path))}
                    </span>
                </div>
            ) : null}
            <p className="text-[12px] text-muted-foreground">
                {POST_WORDS.linkNote}
            </p>
        </section>
    );

    const cardsBox = post ? (
        narrow ? (
            <CardCarousel
                cards={picker}
                style={shownStyle}
                onStyle={setStyle}
                size={size}
                image={image}
                name={item.name}
            />
        ) : (
            <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                <CardPreview
                    image={image}
                    size={size}
                    name={item.name}
                    onRetry={retry}
                />
                <div className="grid gap-3">
                    <CardRow
                        cards={picker}
                        style={shownStyle}
                        onStyle={setStyle}
                        size={size}
                        failed={image.state === "failed"}
                    />
                    <p className="max-w-[260px] text-[12.5px] leading-[1.5] text-muted-foreground">
                        {POST_WORDS.ownCardsWhy}
                    </p>
                </div>
            </div>
        )
    ) : (
        <p
            data-own-no-cards=""
            className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13.5px] text-muted-foreground"
        >
            {POST_WORDS.addSomething}
        </p>
    );

    const failed =
        status === "failed" && error ? (
            <p role="alert" className="text-[13px] text-destructive">
                {error}
            </p>
        ) : null;

    const channels = (
        <ChannelsLocked
            lock={setup.schedule}
            title={POST_WORDS.channels}
            what={POST_WORDS.channelsWhat}
        />
    );

    if (narrow) {
        return (
            <div className="grid gap-4" data-own-composer={mode}>
                {picture}
                {cardsBox}
                <SizeSwitch size={size} onSize={setSize} block />
                {linkBox}
                {captionBox}
                {failed}
                {channels}
                {renderFoot(parts, note)}
            </div>
        );
    }

    return (
        <div data-own-composer={mode}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,470px)_minmax(0,1fr)]">
                <div className="grid min-w-0 gap-3">
                    {picture}
                    {captionBox}
                    {linkBox}
                </div>
                <div className="grid min-w-0 gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-[15px] font-semibold">
                            {POST_WORDS.card}
                        </h2>
                        <SizeSwitch size={size} onSize={setSize} />
                    </div>
                    {cardsBox}
                    {failed}
                    {channels}
                </div>
            </div>
            {renderFoot(parts, note)}
        </div>
    );
}
