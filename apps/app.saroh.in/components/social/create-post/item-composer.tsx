"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
    LookDots,
    PictureFailed,
    SizeSwitch,
    SwipeTrack,
} from "@/components/shared/share-item/card-picker";
import {
    CardPicture,
    InstaFrame,
} from "@/components/shared/share-item/insta-frame";
import { SharePayoff } from "@/components/shared/share-item/payoff";
import { PostToLocked } from "@/components/shared/share-item/schedule-lock";
import type { Shared } from "@/components/shared/share-item/share-actions";
import {
    DownloadIconButton,
    ReadyActions,
    ShareNowButton,
} from "@/components/shared/share-item/share-actions";
import {
    captionTitle,
    LookPicker,
    ShareCaption,
    ShareExtras,
    useShareState,
} from "@/components/shared/share-item/use-share-state";
import type { ShareSetup } from "@/lib/share-item/share";
import { cardImageUrl, firstStyle, markColour } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";
import type { PickRow } from "@/lib/social/pick";
import { POST_WORDS } from "@/lib/social/words";

const CARD = "rounded-xl border border-border bg-card px-4 py-3.5";

/**
 * A post about one live thing, finished (boards BPost*, BCaption*,
 * BDone*): the post as Instagram shows it, Ready to share beside it,
 * Try another look, the caption folded to one line with Edit, and the
 * channels Saroh Social will add, locked. After a share, Ready for
 * Instagram. Keyed by the row at the caller.
 */
export function ItemComposer({
    row,
    setup,
    business,
    narrow,
    onChange,
    onAnother,
    onDone,
}: {
    row: PickRow & { item: NonNullable<PickRow["item"]> };
    setup: ShareSetup;
    business: string;
    narrow: boolean;
    onChange: () => void;
    onAnother: () => void;
    /** Whether the page shows Ready for Instagram, for its header. */
    onDone?: (done: boolean) => void;
}) {
    const { item } = row;
    const share = useShareState(item, setup, narrow);
    const [editing, setEditing] = useState(false);
    const [look, setLook] = useState(false);
    const [done, setDoneState] = useState<Shared | null>(null);
    const openRef = useRef<HTMLDivElement | null>(null);
    const colour = markColour(setup.swatches);
    const setDone = (d: Shared | null) => {
        setDoneState(d);
        onDone?.(d !== null);
    };

    useEffect(() => {
        if ((editing || look) && narrow) {
            openRef.current?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        }
    }, [editing, look, narrow]);

    if (done) {
        return (
            <SharePayoff
                business={business}
                colour={colour}
                image={share.image}
                size={share.size}
                name={row.name}
                words={share.text}
                caption={share.parts.caption}
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

    const picture =
        share.image.state === "failed" ? (
            <PictureFailed
                onRetry={share.retry}
                className="rounded-none border-0"
            />
        ) : narrow ? (
            <SwipeTrack
                cards={share.picker}
                style={share.style}
                onStyle={share.setStyle}
                size={share.size}
                image={share.image}
                name={row.name}
            />
        ) : (
            <CardPicture
                image={share.image}
                size={share.size}
                name={row.name}
            />
        );
    const frame = (
        <InstaFrame
            business={business}
            colour={colour}
            words={share.text}
            clamp={narrow}
            picture={picture}
            className="w-full max-w-[400px]"
        />
    );

    if (narrow) {
        return (
            <div className="grid gap-3" data-item-composer={item.kind}>
                {frame}
                <LookDots cards={share.picker} style={share.style} />
                <RowButton
                    title={captionTitle(share)}
                    line={POST_WORDS.captionRowLine}
                    open={editing}
                    onClick={() => setEditing((e) => !e)}
                />
                <RowButton
                    title={SHARE_WORDS.sizeAndColours}
                    line={POST_WORDS.lookRowLine}
                    open={look}
                    onClick={() => setLook((l) => !l)}
                />
                <div
                    ref={openRef}
                    className="grid grid-cols-[minmax(0,1fr)] gap-4"
                >
                    {editing ? (
                        <ShareCaption
                            share={share}
                            phone
                            onDone={() => setEditing(false)}
                            className={CARD}
                        />
                    ) : null}
                    {look ? (
                        <div
                            className={cn(
                                CARD,
                                "grid grid-cols-[minmax(0,1fr)] gap-3",
                            )}
                        >
                            <SizeSwitch
                                size={share.size}
                                onSize={share.setSize}
                                block
                            />
                            <ShareExtras
                                item={item}
                                setup={setup}
                                share={share}
                            />
                        </div>
                    ) : null}
                </div>
                <PhoneFoot>
                    <div className="flex items-center gap-2">
                        <ShareNowButton {...share.parts} onShared={setDone} />
                        <DownloadIconButton
                            image={share.image}
                            fileName={share.parts.fileName}
                        />
                    </div>
                    <p className="text-center text-[12.5px] text-muted-foreground">
                        {SHARE_WORDS.copiesFirst}
                    </p>
                </PhoneFoot>
            </div>
        );
    }

    return (
        <div
            data-item-composer={item.kind}
            className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]"
        >
            <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-muted p-[26px]">
                {frame}
                <p className="text-center text-[12.5px] text-muted-foreground">
                    {editing
                        ? SHARE_WORDS.previewTyping
                        : SHARE_WORDS.previewNote}
                </p>
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- its photo, or the card the API draws */}
                    <img
                        src={
                            row.image ??
                            cardImageUrl(
                                setup,
                                item,
                                firstStyle(item),
                                "square",
                                {
                                    w: 120,
                                },
                            )
                        }
                        alt=""
                        className="size-10 shrink-0 rounded-[9px] bg-muted object-cover"
                    />
                    <div className="min-w-0 flex-1">
                        <b
                            data-ph-mask=""
                            className="block truncate text-[14.5px] font-semibold"
                        >
                            {row.name}
                        </b>
                        <span className="block truncate text-[13px] text-muted-foreground">
                            {row.line} · {POST_WORDS.liveWhere(item.kind)}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="bg-card"
                        onClick={onChange}
                    >
                        {POST_WORDS.change}
                    </Button>
                </div>
                {editing ? (
                    <ShareCaption
                        share={share}
                        onDone={() => setEditing(false)}
                        className={CARD}
                    />
                ) : (
                    <div className="grid gap-3">
                        <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.01em]">
                            {SHARE_WORDS.ready}
                        </h2>
                        <ReadyActions {...share.parts} onShared={setDone} />
                    </div>
                )}
                <LookPicker
                    item={item}
                    setup={setup}
                    share={share}
                    className={CARD}
                />
                {editing ? null : (
                    <div className={cn(CARD, "flex items-center gap-3")}>
                        <div className="min-w-0 flex-1">
                            <b className="block text-[14px] font-semibold">
                                {captionTitle(share)}
                            </b>
                            <span
                                data-ph-mask=""
                                className="block truncate text-[13px] text-muted-foreground"
                            >
                                {share.text}
                            </span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="bg-card"
                            onClick={() => setEditing(true)}
                            data-edit-caption=""
                        >
                            {POST_WORDS.edit}
                        </Button>
                    </div>
                )}
                {editing ? null : <PostToLocked lock={setup.schedule} />}
            </div>
        </div>
    );
}

/** A phone row that opens a part under the post. */
export function RowButton({
    title,
    line,
    open,
    onClick,
}: {
    title: string;
    line: string;
    open: boolean;
    onClick: () => void;
}) {
    return (
        <Button
            type="button"
            variant="outline"
            aria-expanded={open}
            onClick={onClick}
            data-ph-unmask=""
            className="h-auto min-h-14 w-full justify-start gap-3 whitespace-normal rounded-xl bg-card px-3.5 py-2.5 text-left font-normal"
        >
            <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] font-semibold">{title}</b>
                <span className="block text-[13px] text-muted-foreground">
                    {line}
                </span>
            </span>
            <ChevronRight
                aria-hidden
                className={cn(
                    "size-4 transition-transform",
                    open && "rotate-90",
                )}
            />
        </Button>
    );
}

/** The phone's foot, pinned under the thumb. */
export function PhoneFoot({ children }: { children: React.ReactNode }) {
    return (
        <div className="sticky bottom-[var(--tab-bar-inset)] z-10 -mx-4 mt-3 grid gap-2 border-t border-border bg-background px-4 pb-3.5 pt-2.5">
            {children}
        </div>
    );
}
