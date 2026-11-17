"use client";

import { Button } from "@saroh/ui/button";
import { FormSheet, FormSheetBody } from "@saroh/ui/form-sheet";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ShareItem, ShareSetup } from "@/lib/share-item/share";
import { markColour } from "@/lib/share-item/share";
import { SHARE_WORDS } from "@/lib/share-item/words";

import { LookDots, PictureFailed, SizeSwitch, SwipeTrack } from "./card-picker";
import { CardPicture, InstaFrame } from "./insta-frame";
import { SharePayoff } from "./payoff";
import { SocialLine } from "./schedule-lock";
import type { Shared } from "./share-actions";
import {
    DownloadIconButton,
    ReadyActions,
    ShareNowButton,
} from "./share-actions";
import {
    LookPicker,
    ShareCaption,
    ShareExtras,
    useShareState,
} from "./use-share-state";

/**
 * Share as a post (#1375 U2; boards SBShare* and SPayoff*, 16 Nov:
 * the finished post first, Ready to share beside it): "Share" beside
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
            <ShareBody
                item={item}
                setup={setup}
                onClose={() => setOpen(false)}
            />
        </FormSheet>
    );
}

/**
 * The sheet's inside, mounted only while it is open, so the picture is
 * fetched then. Its parts (`InstaFrame`, `ReadyActions`, `LookPicker`,
 * `CaptionBox`, `SharePayoff`) are what Create post reuses.
 */
function ShareBody({
    item,
    setup,
    onClose,
}: {
    item: ShareItem;
    setup: ShareSetup;
    onClose: () => void;
}) {
    const narrow = useNarrow();
    const share = useShareState(item, setup, narrow);
    const { image, retry, parts } = share;
    const [done, setDone] = useState<Shared | null>(null);
    const [editing, setEditing] = useState(false);
    const [look, setLook] = useState(false);
    const editRef = useRef<HTMLDivElement | null>(null);
    const business = setup.business ?? "";
    const colour = markColour(setup.swatches);
    const words = share.text;

    // The phone's caption and look open under the post, scrolled to.
    useEffect(() => {
        if ((editing || look) && narrow) {
            editRef.current?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        }
    }, [editing, look, narrow]);

    if (done) {
        return (
            <>
                <FormSheetBody className="justify-center">
                    <SharePayoff
                        business={business}
                        colour={colour}
                        image={image}
                        size={share.size}
                        name={item.name}
                        words={words}
                        caption={parts.caption}
                        done={done}
                        lock={setup.schedule}
                        back={{
                            label: SHARE_WORDS.tryLook,
                            onClick: () => setDone(null),
                        }}
                        narrow={narrow}
                    />
                </FormSheetBody>
                {narrow ? null : (
                    <div className="mt-4 flex justify-end border-t border-border pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="bg-card"
                            onClick={onClose}
                        >
                            {SHARE_WORDS.captionDone}
                        </Button>
                    </div>
                )}
            </>
        );
    }

    const picture =
        image.state === "failed" ? (
            <PictureFailed onRetry={retry} className="rounded-none border-0" />
        ) : narrow ? (
            <SwipeTrack
                cards={share.picker}
                style={share.style}
                onStyle={share.setStyle}
                size={share.size}
                image={image}
                name={item.name}
            />
        ) : (
            <CardPicture image={image} size={share.size} name={item.name} />
        );
    const frame = (
        <InstaFrame
            business={business}
            colour={colour}
            words={words}
            clamp={narrow}
            picture={picture}
        />
    );

    if (narrow) {
        return (
            <>
                <FormSheetBody className="gap-3">
                    {frame}
                    <LookDots cards={share.picker} style={share.style} />
                    <div
                        ref={editRef}
                        className="grid grid-cols-[minmax(0,1fr)] gap-4"
                    >
                        {editing ? (
                            <ShareCaption
                                share={share}
                                phone
                                onDone={() => setEditing(false)}
                            />
                        ) : null}
                        {look ? (
                            <div
                                className="grid grid-cols-[minmax(0,1fr)] gap-3"
                                data-share-look=""
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
                </FormSheetBody>
                <div className="mt-3 grid gap-2 border-t border-border pt-3">
                    <div className="flex items-center gap-2">
                        <ShareNowButton {...parts} onShared={setDone} />
                        <DownloadIconButton
                            image={image}
                            fileName={parts.fileName}
                        />
                    </div>
                    <p className="text-center text-[12.5px] text-muted-foreground">
                        {SHARE_WORDS.copiesFirst}{" "}
                        <TextLink
                            onClick={() => setEditing((e) => !e)}
                            aria-expanded={editing}
                            className="font-semibold"
                        >
                            {SHARE_WORDS.editCaptionShort}
                        </TextLink>
                        {" · "}
                        <TextLink
                            onClick={() => setLook((l) => !l)}
                            aria-expanded={look}
                            className="font-semibold"
                        >
                            {SHARE_WORDS.sizeAndColours}
                        </TextLink>
                    </p>
                    <SocialLine
                        lock={setup.schedule}
                        words={SHARE_WORDS.scheduleWith}
                        className="text-center"
                    />
                </div>
            </>
        );
    }

    return (
        <>
            <FormSheetBody className="gap-0">
                <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,350px)_minmax(0,1fr)]">
                    <div className="grid gap-3">
                        {frame}
                        <p className="text-center text-[12.5px] text-muted-foreground">
                            {SHARE_WORDS.previewNote}
                        </p>
                    </div>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
                        <div className="grid gap-3">
                            <h3 className="text-[20px] font-semibold tracking-[-0.01em]">
                                {SHARE_WORDS.ready}
                            </h3>
                            <ReadyActions {...parts} onShared={setDone} />
                        </div>
                        <LookPicker item={item} setup={setup} share={share} />
                        {editing ? (
                            <ShareCaption
                                share={share}
                                onDone={() => setEditing(false)}
                            />
                        ) : (
                            <div>
                                <TextLink
                                    onClick={() => setEditing(true)}
                                    className="font-semibold"
                                    data-edit-caption=""
                                >
                                    {SHARE_WORDS.editCaption}
                                </TextLink>
                            </div>
                        )}
                    </div>
                </div>
            </FormSheetBody>
            <div className="mt-4 border-t border-border pt-4">
                <SocialLine lock={setup.schedule} />
            </div>
        </>
    );
}
