"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { Segmented } from "@saroh/ui/segmented";
import { Switch } from "@saroh/ui/switch";
import { TextLink } from "@saroh/ui/text-link";
import { Textarea } from "@saroh/ui/textarea";
import { CalendarClock } from "lucide-react";
import { useId } from "react";

import { cn } from "@saroh/ui/lib/utils";

import { LimitReachedCard } from "@/components/billing/plan-way";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { ChannelKind } from "@/lib/social/saroh-social-types";
import { CHANNEL_KINDS } from "@/lib/social/saroh-social-types";
import {
    captionWithLink,
    countsNextMonth,
    meterOf,
    whenWords,
} from "@/lib/social/saroh-social-view";
import {
    CHANNEL_NAMES,
    CHANNEL_SHORT,
    SOCIAL_WORDS,
} from "@/lib/social/saroh-social-words";
import type {
    SocialCompose,
    SocialPostState,
} from "@/lib/social/use-social-post";

import { ChannelIcon } from "../channels/channel-icon";
import { ConnectButton } from "../channels/connect-sheet";
import { UsageMeter } from "../meter";
import { TimeDialog } from "../time-dialog";

const SEC = "grid gap-2.5 rounded-xl border border-border bg-card px-4 py-3.5";

/**
 * "Post to" and "When" (board BSocialDesk; S4): a switch for each channel
 * that works, Reconnect or Connect in place for one that doesn't, the
 * channel's own words behind "Edit for …", then Schedule at the good
 * time, Post now, or Pick a time. With the month used up, When is the
 * limit and its Request more (S7).
 */
export function SocialPostPanel({
    social,
    post,
    text,
    storySize,
    onShareYourself,
}: {
    social: SocialCompose;
    post: SocialPostState;
    /** The caption's words, for a channel's own words to start from. */
    text: string;
    /** Story is picked: Saroh posts Post and Square only. */
    storySize: boolean;
    /** "Or share it yourself": back to Ready to share. */
    onShareYourself: () => void;
}) {
    const zone = useBusinessZone();
    const ids = { postTo: useId(), when: useId() };
    const usage = social.access.usage;
    const meter = usage ? meterOf(usage, zone) : null;
    const rows = social.channels;
    const off = storySize ? SOCIAL_WORDS.storyNotPosted : post.blocked;
    const later = countsNextMonth(post.at, usage, zone);

    return (
        <div
            className="grid grid-cols-[minmax(0,1fr)] gap-3.5"
            data-social-panel=""
        >
            <section aria-labelledby={ids.postTo} className={SEC}>
                <h3 id={ids.postTo} className="text-[14.5px] font-semibold">
                    {SOCIAL_WORDS.postTo}
                </h3>
                {social.channelsFailed ? (
                    <Notice tone="error" role="alert">
                        {`Couldn't load ${SOCIAL_WORDS.channelsFailed}. Try again in a minute.`}
                    </Notice>
                ) : null}
                <ul className="grid gap-1">
                    {rows.map((c) => {
                        const on = post.on.includes(c.kind);
                        const own = post.captions[c.kind];
                        return (
                            <li
                                key={c.kind}
                                data-post-to={c.kind}
                                className="grid gap-1.5"
                            >
                                <div className="flex min-h-11 items-center gap-2.5">
                                    <ChannelIcon kind={c.kind} />
                                    <span className="min-w-0 flex-1">
                                        <b className="block text-[13.5px] font-semibold">
                                            {CHANNEL_NAMES[c.kind]}
                                        </b>
                                        <small
                                            data-ph-mask=""
                                            className="block truncate text-[12px] text-muted-foreground"
                                        >
                                            {c.handle ??
                                                SOCIAL_WORDS.notConnected}
                                        </small>
                                    </span>
                                    {c.state === "CONNECTED" ? (
                                        <Switch
                                            checked={on}
                                            onCheckedChange={(v) =>
                                                post.toggle(c.kind, v)
                                            }
                                            aria-label={SOCIAL_WORDS.postToChannel(
                                                c.kind,
                                            )}
                                        />
                                    ) : social.access.canPost ? (
                                        <ConnectButton
                                            channel={c}
                                            size="sm"
                                            variant="outline"
                                            className="bg-card"
                                        />
                                    ) : null}
                                </div>
                                {on ? (
                                    post.editing === c.kind ? (
                                        <div className="grid gap-1.5 pl-[42px]">
                                            <Textarea
                                                aria-label={SOCIAL_WORDS.editFor(
                                                    c.kind,
                                                )}
                                                value={own ?? text}
                                                onChange={(e) =>
                                                    post.setCaption(
                                                        c.kind,
                                                        e.target.value,
                                                    )
                                                }
                                                rows={3}
                                                data-ph-mask=""
                                                data-own-caption={c.kind}
                                            />
                                            {own !== undefined ? (
                                                <TextLink
                                                    onClick={() => {
                                                        post.setCaption(
                                                            c.kind,
                                                            null,
                                                        );
                                                        post.setEditing(null);
                                                    }}
                                                    className="w-fit text-[12.5px] font-semibold"
                                                >
                                                    {SOCIAL_WORDS.useMain}
                                                </TextLink>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <TextLink
                                            onClick={() =>
                                                post.setEditing(c.kind)
                                            }
                                            className="ml-[42px] w-fit text-[12.5px] font-semibold"
                                            data-edit-for={c.kind}
                                        >
                                            {SOCIAL_WORDS.editFor(c.kind)}
                                        </TextLink>
                                    )
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
                {post.threads && post.threads.state !== "fits" ? (
                    <p
                        data-threads-fit={post.threads.state}
                        role={
                            post.threads.state === "over" ? "alert" : undefined
                        }
                        className="text-pretty text-[12.5px] text-foreground"
                    >
                        {post.threads.state === "over"
                            ? SOCIAL_WORDS.threadsOver(post.threads.bytes)
                            : SOCIAL_WORDS.threadsCut(post.threads.bytes)}
                    </p>
                ) : null}
            </section>

            <section aria-labelledby={ids.when} className={SEC}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3
                        id={ids.when}
                        className="flex-1 text-[14.5px] font-semibold"
                    >
                        {SOCIAL_WORDS.when}
                    </h3>
                    <UsageMeter
                        access={social.access}
                        className="text-[12.5px]"
                    />
                </div>
                {post.full && usage ? (
                    <LimitReachedCard
                        data-social-limit=""
                        size="inline"
                        title={SOCIAL_WORDS.usedAll(
                            usage.limit ?? 0,
                            meter?.month ?? "",
                        )}
                        description={SOCIAL_WORDS.usedAllWhat(
                            meter?.resets ?? "",
                        )}
                        secondary={
                            <span className="grid gap-2">
                                {post.requested ? (
                                    <span className="text-[13px] text-muted-foreground">
                                        {SOCIAL_WORDS.requested}
                                    </span>
                                ) : social.access.canPost ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-fit bg-card"
                                        onClick={() => void post.requestMore()}
                                        data-request-more=""
                                    >
                                        {SOCIAL_WORDS.requestMore}
                                    </Button>
                                ) : null}
                                <TextLink
                                    onClick={onShareYourself}
                                    className="w-fit font-semibold"
                                >
                                    {SOCIAL_WORDS.shareFree}
                                </TextLink>
                            </span>
                        }
                    />
                ) : (
                    <>
                        {post.error ? (
                            <Notice
                                tone="error"
                                role="alert"
                                data-social-error=""
                            >
                                {post.error}
                            </Notice>
                        ) : null}
                        {off ? (
                            <p className="text-pretty text-[13px] text-muted-foreground">
                                {off}
                            </p>
                        ) : null}
                        {post.at ? (
                            <Button
                                type="button"
                                disabled={Boolean(off)}
                                busy={post.busy === "schedule"}
                                busyLabel="Scheduling…"
                                onClick={() => {
                                    if (post.at) void post.schedule(post.at);
                                }}
                                data-schedule-good=""
                                // whitespace-normal: the button's nowrap ran the
                                // suggestion past a phone's edge and zoomed the page out.
                                className="h-auto min-h-14 w-full justify-start gap-3 whitespace-normal rounded-xl px-4 py-2.5 text-left text-[15px] font-semibold"
                            >
                                <CalendarClock
                                    aria-hidden
                                    className="size-4 shrink-0"
                                />
                                <span className="min-w-0">
                                    <span className="block">
                                        {SOCIAL_WORDS.scheduleFor(
                                            whenWords(post.at, zone),
                                        )}
                                    </span>
                                    <span className="block text-[12.5px] font-normal opacity-75">
                                        {SOCIAL_WORDS.scheduleGood}
                                    </span>
                                </span>
                            </Button>
                        ) : null}
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 bg-card"
                                disabled={Boolean(off)}
                                busy={post.busy === "now"}
                                busyLabel={SOCIAL_WORDS.posting}
                                onClick={() => void post.postNow()}
                                data-post-now=""
                            >
                                {SOCIAL_WORDS.postNow}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 bg-card"
                                disabled={Boolean(off)}
                                onClick={() => post.setPicking(true)}
                                data-pick-time=""
                            >
                                {SOCIAL_WORDS.pickTime}
                            </Button>
                        </div>
                        <p className="text-pretty text-[12.5px] text-muted-foreground">
                            {SOCIAL_WORDS.countsAs(usage?.limit ?? null, later)}
                        </p>
                        <TextLink
                            onClick={() => void post.saveDraft()}
                            className="w-fit text-[13px] font-semibold"
                            data-save-draft=""
                        >
                            {post.busy === "draft"
                                ? "Saving…"
                                : SOCIAL_WORDS.saveDraft}
                        </TextLink>
                    </>
                )}
            </section>
            <TextLink
                onClick={onShareYourself}
                className="w-fit py-2 text-[13px] font-semibold"
                data-share-yourself=""
            >
                {SOCIAL_WORDS.shareYourself}
            </TextLink>
            <TimeDialog
                open={post.picking}
                title={SOCIAL_WORDS.pickTitle}
                saveLabel={SOCIAL_WORDS.scheduleAt}
                initial={social.day ?? post.at}
                goodTimes={social.access.goodTimes}
                onClose={() => post.setPicking(false)}
                onPick={(at) => post.schedule(at)}
            />
        </div>
    );
}

/**
 * "Preview on" Instagram, Facebook or Threads (BSocialDesk): which
 * channel's words the post's frame shows. Only channels it goes to.
 */
export function PreviewOn({
    kinds,
    value,
    onValue,
    className,
}: {
    kinds: readonly ChannelKind[];
    value: ChannelKind;
    onValue: (k: ChannelKind) => void;
    className?: string;
}) {
    if (kinds.length < 2) return null;
    return (
        <Segmented
            label={SOCIAL_WORDS.previewOn}
            size="sm"
            value={value}
            onValueChange={onValue}
            options={CHANNEL_KINDS.filter((k) => kinds.includes(k)).map(
                (k) => ({
                    value: k,
                    label: CHANNEL_SHORT[k],
                }),
            )}
            className={cn(className)}
        />
    );
}

/** The frame's caption end for a channel: "Link in bio", or the link inline. */
export function previewTail(kind: ChannelKind, link: string): string {
    return kind === "INSTAGRAM"
        ? SOCIAL_WORDS.linkInBio
        : captionWithLink(kind, "", link);
}
