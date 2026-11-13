"use client";

import { TextLink } from "@saroh/ui/text-link";

import {
    CardCarousel,
    CardRow,
    PictureFailed,
    SizeSwitch,
} from "@/components/shared/share-item/card-picker";
import { ChannelsLocked } from "@/components/shared/share-item/schedule-lock";
import {
    ShareCaption,
    ShareExtras,
    useShareState,
} from "@/components/shared/share-item/use-share-state";
import type { ShareSetup } from "@/lib/share-item/share";
import type { PickRow } from "@/lib/social/pick";
import { POST_WORDS } from "@/lib/social/words";

import { ComposerFoot } from "./composer-foot";
import { PostPreviews } from "./post-previews";

/**
 * A post about one live thing (SFCLockedDesk, SFCLockedPhone): what it is,
 * its cards, the caption, and Channels locked until Saroh Social. Share now
 * works on every plan. Keyed by the row at the caller.
 */
export function ItemComposer({
    row,
    setup,
    business,
    narrow,
    onChange,
}: {
    row: PickRow & { item: NonNullable<PickRow["item"]> };
    setup: ShareSetup;
    business: string;
    narrow: boolean;
    onChange: () => void;
}) {
    const { item } = row;
    const share = useShareState(item, setup, narrow);
    const what = (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold max-sm:sr-only">
                    {POST_WORDS.what}
                </p>
                <p
                    data-ph-mask=""
                    className="truncate text-[14.5px] font-semibold"
                >
                    {row.name}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                    {row.line} · live
                </p>
            </div>
            <TextLink onClick={onChange} className="font-semibold">
                {POST_WORDS.change}
            </TextLink>
        </div>
    );
    const channels = (
        <ChannelsLocked
            lock={setup.schedule}
            title={POST_WORDS.channels}
            what={POST_WORDS.channelsWhat}
        />
    );
    const caption = (
        <div className="rounded-xl border border-border bg-card p-4">
            <ShareCaption share={share} showLabel />
        </div>
    );
    const foot = (
        <ComposerFoot
            parts={share.parts}
            lock={setup.schedule}
            narrow={narrow}
        />
    );

    if (narrow) {
        return (
            <div className="grid gap-4" data-item-composer={item.kind}>
                {what}
                {share.image.state === "failed" ? (
                    <PictureFailed onRetry={share.retry} />
                ) : (
                    <CardCarousel
                        cards={share.picker}
                        style={share.style}
                        onStyle={share.setStyle}
                        size={share.size}
                        image={share.image}
                        name={row.name}
                    />
                )}
                <SizeSwitch size={share.size} onSize={share.setSize} block />
                <ShareExtras item={item} setup={setup} share={share} />
                {caption}
                {channels}
                {foot}
            </div>
        );
    }

    return (
        <div data-item-composer={item.kind}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
                <div className="grid min-w-0 gap-3">
                    {what}
                    <div className="grid gap-4 rounded-xl border border-border bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-[14px] font-semibold">
                                {POST_WORDS.picture}
                            </h2>
                            <SizeSwitch
                                size={share.size}
                                onSize={share.setSize}
                            />
                        </div>
                        <CardRow
                            cards={share.picker}
                            style={share.style}
                            onStyle={share.setStyle}
                            size={share.size}
                            failed={share.image.state === "failed"}
                        />
                        <ShareExtras item={item} setup={setup} share={share} />
                    </div>
                    {caption}
                    {channels}
                </div>
                <div className="min-w-0">
                    {share.image.state === "failed" ? (
                        <PictureFailed onRetry={share.retry} />
                    ) : (
                        <PostPreviews
                            image={share.image}
                            caption={share.parts.caption}
                            link={share.parts.link}
                            business={business}
                        />
                    )}
                </div>
            </div>
            {foot}
        </div>
    );
}
