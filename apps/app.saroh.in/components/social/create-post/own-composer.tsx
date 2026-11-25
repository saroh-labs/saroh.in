"use client";

import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { TextLink } from "@saroh/ui/text-link";
import { Textarea } from "@saroh/ui/textarea";
import { Check, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { PickedImage } from "@/components/shared/fields/media-picker";
import { MediaPicker } from "@/components/shared/fields/media-picker";
import {
    CardRow,
    LookDots,
    SizeSwitch,
    SwipeTrack,
} from "@/components/shared/share-item/card-picker";
import {
    CardPicture,
    InstaFrame,
} from "@/components/shared/share-item/insta-frame";
import { SharePayoff } from "@/components/shared/share-item/payoff";
import type {
    Shared,
    ShareParts,
} from "@/components/shared/share-item/share-actions";
import {
    DownloadIconButton,
    ReadyActions,
    ShareNowButton,
} from "@/components/shared/share-item/share-actions";
import { useCardImage } from "@/components/shared/share-item/use-card-image";
import { useSettled } from "@/components/shared/share-item/use-share-state";
import { SocialPostPanel } from "@/components/social/saroh/composer/social-post-panel";
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
    markColour,
    shownLink,
    withLink,
} from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";
import { removeOwnPost, saveOwnPost } from "@/lib/social/actions";
import type { LinkChoice } from "@/lib/social/links";
import { addressOf, shownAddress } from "@/lib/social/links";
import type { OwnPost, OwnPostInput } from "@/lib/social/own-posts";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";
import { useSocialStale } from "@/lib/social/use-social";
import type { SocialCompose } from "@/lib/social/use-social-post";
import { NO_SOCIAL, useSocialPost } from "@/lib/social/use-social-post";
import { counted, POST_WORDS } from "@/lib/social/words";

import { PhoneFoot } from "./item-composer";

/** Instagram's cap on a caption, as the API holds it. */
export const CAPTION_MAX = 2200;
/** How long typing settles before it is saved. */
export const SAVE_AFTER_MS = 800;

const CARD = "rounded-xl border border-border bg-card px-4 py-3.5";

const inputOf = (p: OwnPost): OwnPostInput => ({
    headline: p.headline,
    mediaId: p.mediaId,
    caption: p.caption,
    linkPath: p.linkPath,
    style: p.style,
    size: p.size,
});

/**
 * Your own post (boards BOwnDesk, BOwnPhone): a line, your photo if you
 * like, where the link goes, the caption, and the cards for it, shared on
 * any plan. Saved to Your posts as it is written (`share-posts`), which is
 * what lets its picture be drawn; a saved one reopens here (`initial`) and
 * can be deleted.
 */
export function OwnComposer({
    initial,
    startWithPhoto,
    setup,
    origin,
    fixedLinks,
    pageLinks,
    business,
    ownCount,
    narrow,
    onAnother,
    onDone,
    social = null,
}: {
    initial: OwnPost | null;
    startWithPhoto: boolean;
    setup: ShareSetup;
    /** The live site's address. */
    origin: string;
    fixedLinks: readonly LinkChoice[];
    pageLinks: readonly LinkChoice[];
    business: string;
    /** How many own posts the business had when the page opened. */
    ownCount: number;
    narrow: boolean;
    onAnother: () => void;
    onDone?: (done: boolean) => void;
    /** Saroh Social, when it is on for the business (board BSocialDesk). */
    social?: SocialCompose | null;
}) {
    const id = useId();
    const router = useRouter();
    const stale = useSocialStale();
    const [photo, setPhoto] = useState<PickedImage | null>(null);
    const [mediaId, setMediaId] = useState(initial?.mediaId ?? null);
    const [headline, setHeadline] = useState(initial?.headline ?? "");
    const [caption, setCaption] = useState(initial?.caption ?? "");
    const [linkPath, setLinkPath] = useState(
        initial?.linkPath ?? fixedLinks.at(0)?.path ?? "/",
    );
    const [style, setStyle] = useState<CardStyle>(initial?.style ?? "colour");
    const [size, setSize] = useState<CardSize>(initial?.size ?? "post");
    const [post, setPost] = useState<OwnPost | null>(initial);
    const [status, setStatus] = useState<"idle" | "saving" | "failed">("idle");
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [done, setDoneState] = useState<Shared | null>(null);
    const [deleting, setDeleting] = useState(false);
    const zone = useBusinessZone();
    // "Or share it yourself": Ready to share, as without Saroh Social.
    const [manual, setManual] = useState(false);
    const posting = social !== null && !manual;
    const setDone = (d: Shared | null) => {
        setDoneState(d);
        onDone?.(d !== null);
    };

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
    const postId = useRef<string | null>(initial?.id ?? null);
    const lastSaved = useRef<string | null>(
        initial ? JSON.stringify(inputOf(initial)) : null,
    );
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
                    stale();
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
    }, [key, ready, stale]);

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
    const sp = useSocialPost({
        social: social ?? NO_SOCIAL,
        // Saroh draws the post from the words and photo as they are now.
        base: () =>
            headline.trim() || mediaId
                ? {
                      sourceKind: "own",
                      sourceRef: null,
                      title: headline.trim() || POST_WORDS.ownTitle,
                      picture: "card",
                      cardStyle: shownStyle,
                      size: size === "square" ? "square" : "post",
                      headline: headline.trim() || null,
                      mediaId,
                      caption,
                      linkPath,
                  }
                : null,
        text: caption,
        link: url,
        zone,
    });
    const panel = social ? (
        <SocialPostPanel
            social={social}
            post={sp}
            text={caption}
            storySize={size === "story"}
            onShareYourself={() => setManual(true)}
        />
    ) : null;
    const parts: ShareParts = {
        caption: withLink(caption, url),
        link: url,
        image,
        fileName: cardFileName(item, shownStyle, size),
    };
    const picker = post
        ? cards.map((s) => ({
              style: s,
              src: src(s, narrow ? 480 : 240) ?? "",
          }))
        : [];
    const colour = markColour(setup.swatches);
    // This post counts once it is saved, unless it was already counted.
    const count = ownCount + (post && !initial ? 1 : 0);

    const onDelete = async () => {
        if (!postId.current) return true;
        const res = await removeOwnPost(postId.current);
        if (res.ok) {
            stale();
            router.push("/social");
        }
        return res.ok ? true : { ok: false, error: res.error };
    };

    if (done) {
        return (
            <SharePayoff
                business={business}
                colour={colour}
                image={image}
                size={size}
                name={item.name}
                words={caption}
                caption={parts.caption}
                done={done}
                lock={setup.schedule}
                back={{
                    label: narrow
                        ? POST_WORDS.anotherPost
                        : POST_WORDS.makeAnother,
                    onClick: onAnother,
                }}
                narrow={narrow}
                pinned
                className="lg:min-h-[600px]"
            />
        );
    }

    const picture = !post ? (
        <p
            data-own-no-cards=""
            className="flex aspect-[4/5] w-full items-center justify-center bg-muted px-6 text-center text-[13.5px] text-muted-foreground"
        >
            {POST_WORDS.addSomething}
        </p>
    ) : image.state === "failed" ? (
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-muted px-6 text-center text-[13.5px]">
            {SHARE_WORDS.noPicture}
            <Button type="button" variant="outline" size="sm" onClick={retry}>
                {SHARE_WORDS.tryAgain}
            </Button>
        </div>
    ) : narrow ? (
        <SwipeTrack
            cards={picker}
            style={shownStyle}
            onStyle={setStyle}
            size={size}
            image={image}
            name={item.name}
        />
    ) : (
        <CardPicture image={image} size={size} name={item.name} />
    );

    const headlineField = (
        <Input
            aria-label={POST_WORDS.whatToSay}
            placeholder={POST_WORDS.headlinePlaceholder}
            value={headline}
            maxLength={HEADLINE_MAX}
            onChange={(e) => setHeadline(e.target.value)}
            data-own-headline=""
            className="h-14 rounded-xl border-[1.5px] border-foreground px-3.5 text-[20px] font-semibold"
        />
    );
    const counter = (
        <div className="flex justify-between gap-3 text-[12.5px] text-muted-foreground">
            <span>{POST_WORDS.headlineShort}</span>
            <span aria-live="polite" className="tabular-nums">
                {counted(Array.from(headline).length, HEADLINE_MAX)}
            </span>
        </div>
    );
    const photoField = (
        <div className="grid gap-2" data-own-photo="">
            {photo || mediaId ? (
                <div className="flex items-center gap-3">
                    {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the photo just uploaded to the library
                        <img
                            src={photo.src}
                            alt=""
                            className="size-11 shrink-0 rounded-[8px] object-cover"
                        />
                    ) : null}
                    <span
                        data-ph-mask=""
                        className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
                    >
                        {photo?.filename ?? POST_WORDS.yourPhoto}
                    </span>
                    <TextLink
                        onClick={() => {
                            setPhoto(null);
                            setMediaId(null);
                        }}
                        className="font-semibold"
                    >
                        {POST_WORDS.removePhoto}
                    </TextLink>
                </div>
            ) : null}
            <MediaPicker
                onPick={(p) => {
                    setPhoto(p);
                    setMediaId(p.mediaId ?? null);
                }}
                label={
                    photo || mediaId
                        ? POST_WORDS.changePhoto
                        : startWithPhoto
                          ? POST_WORDS.choosePhoto
                          : POST_WORDS.addPhoto
                }
            />
        </div>
    );
    const choices = [...fixedLinks, ...pageLinks];
    const chosen = choices.find((c) => c.path === linkPath) ?? null;
    const linkField = (
        <div className="flex flex-wrap items-center gap-2.5">
            <span id={`${id}-link`} className="text-[13.5px]">
                {POST_WORDS.linkTo}
            </span>
            <Select
                value={chosen?.value}
                onValueChange={(v) => {
                    const c = choices.find((x) => x.value === v);
                    if (c) setLinkPath(c.path);
                }}
            >
                <SelectTrigger
                    aria-labelledby={`${id}-link`}
                    className="h-10 w-auto min-w-[220px] max-w-full"
                >
                    <SelectValue placeholder={POST_WORDS.choosePage} />
                </SelectTrigger>
                <SelectContent>
                    {choices.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                            {c.label} ·{" "}
                            {shownAddress(addressOf(origin, c.path))}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
    const captionEditor = (
        <section className={cn(CARD, "grid gap-3")} data-own-caption-editor="">
            <div className="flex items-center justify-between gap-3">
                <h3
                    id={`${id}-caption`}
                    className="text-[14.5px] font-semibold"
                >
                    {POST_WORDS.caption}
                </h3>
                <Button type="button" onClick={() => setEditing(false)}>
                    {SHARE_WORDS.captionDone}
                </Button>
            </div>
            <div className="rounded-[10px] border border-input bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                <Textarea
                    aria-labelledby={`${id}-caption`}
                    value={caption}
                    maxLength={CAPTION_MAX}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={3}
                    data-own-caption=""
                    className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.5] shadow-none focus-visible:ring-0"
                />
                <span
                    title={url}
                    className="mt-2 inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 text-[12.5px] text-muted-foreground"
                >
                    <Link2 aria-hidden className="size-3.5 shrink-0" />
                    <span className="truncate">{shownLink(url)}</span>
                </span>
            </div>
            <p className="text-right text-[12px] tabular-nums text-muted-foreground">
                {counted(caption.length, CAPTION_MAX)}
            </p>
            {narrow ? linkField : null}
        </section>
    );
    const draftLine = (
        <div
            data-own-draft=""
            className={cn(
                "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground",
                narrow ? "justify-center" : cn(CARD, "py-3"),
            )}
        >
            {status === "failed" && error ? (
                <span role="alert" className="text-destructive">
                    {error}
                </span>
            ) : (
                <span className="flex items-center gap-1.5" aria-live="polite">
                    {status === "saving" ? null : (
                        <Check aria-hidden className="size-3.5" />
                    )}
                    {status === "saving"
                        ? POST_WORDS.saving
                        : post
                          ? POST_WORDS.draftSaved
                          : POST_WORDS.savesAsYouGo}
                </span>
            )}
            <span aria-hidden>·</span>
            <TextLink href="/social" className="font-semibold">
                {POST_WORDS.yourPostsCount(count)}
            </TextLink>
            {post ? (
                <TextLink
                    onClick={() => setDeleting(true)}
                    className={cn("font-semibold", !narrow && "ml-auto")}
                    data-own-delete=""
                >
                    {POST_WORDS.deleteDraft}
                </TextLink>
            ) : null}
        </div>
    );
    const confirm = (
        <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={POST_WORDS.deleteTitle}
            description={POST_WORDS.deleteWhat}
            confirmLabel={POST_WORDS.deleteConfirm}
            keepLabel={POST_WORDS.keepIt}
            tone="destructive"
            onConfirm={onDelete}
        />
    );
    const looks = post ? (
        <section aria-label={SHARE_WORDS.tryLook} className={CARD}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold">
                    {SHARE_WORDS.tryLook}
                </h3>
                <SizeSwitch size={size} onSize={setSize} />
            </div>
            <CardRow
                cards={picker}
                style={shownStyle}
                onStyle={setStyle}
                size={size}
                failed={image.state === "failed"}
            />
            <p className="mt-3 text-[12.5px] leading-[1.5] text-muted-foreground">
                {POST_WORDS.ownCardsWhy}
            </p>
        </section>
    ) : null;

    if (narrow) {
        return (
            <div className="grid gap-3" data-own-composer="">
                {headlineField}
                {counter}
                <InstaFrame
                    business={business}
                    colour={colour}
                    words={caption}
                    clamp
                    picture={picture}
                />
                {post ? (
                    <>
                        <LookDots cards={picker} style={shownStyle} />
                        <SizeSwitch size={size} onSize={setSize} block />
                    </>
                ) : null}
                {photoField}
                <Button
                    type="button"
                    variant="outline"
                    className="h-11 bg-card font-semibold"
                    aria-expanded={editing}
                    onClick={() => setEditing((e) => !e)}
                >
                    {POST_WORDS.captionAndLink}
                </Button>
                {editing ? captionEditor : null}
                {posting ? panel : null}
                {draftLine}
                {confirm}
                {posting ? null : (
                    <PhoneFoot>
                        <div className="flex items-center gap-2">
                            <ShareNowButton {...parts} onShared={setDone} />
                            <DownloadIconButton
                                image={image}
                                fileName={parts.fileName}
                            />
                        </div>
                        <p className="text-center text-[12.5px] text-muted-foreground">
                            {SHARE_WORDS.copiesFirst}
                        </p>
                    </PhoneFoot>
                )}
            </div>
        );
    }

    return (
        <div
            data-own-composer=""
            className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]"
        >
            <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-muted p-[26px]">
                <InstaFrame
                    business={business}
                    colour={colour}
                    words={caption}
                    picture={picture}
                    className="w-full max-w-[400px]"
                />
                <p className="text-center text-[12.5px] text-muted-foreground">
                    {POST_WORDS.drawsAsYouType}
                </p>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5">
                <section className={cn(CARD, "grid gap-3")}>
                    <h2 className="text-[14px] font-semibold">
                        {POST_WORDS.whatToSay}
                    </h2>
                    {headlineField}
                    {counter}
                    {photoField}
                    {linkField}
                </section>
                {editing ? (
                    captionEditor
                ) : posting ? (
                    panel
                ) : (
                    <div className="grid gap-3">
                        <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.01em]">
                            {SHARE_WORDS.ready}
                        </h2>
                        <ReadyActions {...parts} onShared={setDone} />
                        {social ? (
                            <TextLink
                                onClick={() => setManual(false)}
                                className="w-fit font-semibold"
                            >
                                {SOCIAL_WORDS.backToSchedule}
                            </TextLink>
                        ) : null}
                    </div>
                )}
                {looks}
                {editing ? null : (
                    <div className={cn(CARD, "flex items-center gap-3")}>
                        <div className="min-w-0 flex-1">
                            <b className="block text-[14px] font-semibold">
                                {POST_WORDS.caption}
                            </b>
                            <span
                                data-ph-mask=""
                                className="block truncate text-[13px] text-muted-foreground"
                            >
                                {caption.trim() || POST_WORDS.noCaptionYet}
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="bg-card"
                            onClick={() => setEditing(true)}
                        >
                            {POST_WORDS.edit}
                        </Button>
                    </div>
                )}
                {draftLine}
                {confirm}
            </div>
        </div>
    );
}
