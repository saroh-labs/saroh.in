"use client";

import { ChipGroup } from "@saroh/ui/choice-group";
import { EmptyState } from "@saroh/ui/data-state";
import { FailedRead } from "@saroh/ui/failed-read";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { RadioTower } from "lucide-react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatTime } from "@/lib/format/datetime";
import { joinFacts } from "@/lib/format/join";
import { count } from "@/lib/format/plural";
import type {
    Read,
    SocialAccess,
    SocialChannel,
    SocialPost,
} from "@/lib/social/saroh-social-types";
import type { PostChip } from "@/lib/social/saroh-social-view";
import {
    channelList,
    chipPosts,
    inChip,
    nextSevenDays,
    POST_CHIPS,
    postLine,
    postPill,
} from "@/lib/social/saroh-social-view";
import { CHANNEL_NAMES, SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

import { ConnectButton } from "./channels/connect-sheet";
import { PostThumb } from "./post-thumb";

const postHref = (id: string) => `/social?post=${encodeURIComponent(id)}`;
/** A new post at the day's good time, or on the day with a time to pick. */
const newPostOn = (day: string, at: string | null) =>
    at
        ? `/social/new?at=${encodeURIComponent(at)}`
        : `/social/new?day=${encodeURIComponent(day)}`;

/**
 * Social's posts (board BSocialHomeSocialDesk; research S3, S8): the next
 * seven days, each with what goes out or a way to add one at its good
 * time, then Posted and drafts by chip. With no channel connected, the
 * three ways to connect one, in place.
 */
export function PostsView({
    access,
    channels,
    channelsRead,
    posts,
    canPost,
    narrow,
}: {
    access: SocialAccess;
    channels: SocialChannel[];
    channelsRead: boolean;
    posts: Read<SocialPost[]>;
    canPost: boolean;
    narrow: boolean;
}) {
    const zone = useBusinessZone();
    const [chip, setChip] = useState<PostChip>("all");
    const rows = posts.ok ? posts.data : [];
    const none =
        channelsRead && channels.every((c) => c.state === "NOT_CONNECTED");
    const waiting = channels.filter(
        (c) => c.state === "NEEDS_ATTENTION" && c.waitingPosts > 0,
    );

    if (none && rows.length === 0) {
        return (
            <section
                data-social-connect-first=""
                className="grid justify-items-center gap-4 rounded-2xl border border-dashed border-border-strong bg-card px-6 py-10 text-center"
            >
                <RadioTower
                    aria-hidden
                    className="size-6 text-muted-foreground"
                />
                <h2 className="text-[19px] font-semibold">
                    {SOCIAL_WORDS.connectFirst}
                </h2>
                <p className="max-w-[460px] text-pretty text-[14px] text-muted-foreground">
                    {SOCIAL_WORDS.connectFirstWhat}
                </p>
                {canPost ? (
                    <div className="flex flex-wrap justify-center gap-2">
                        {channels.map((c) => (
                            <ConnectButton
                                key={c.kind}
                                channel={c}
                                variant="outline"
                            />
                        ))}
                    </div>
                ) : null}
            </section>
        );
    }

    const days = nextSevenDays(rows, access.goodTimes, zone);
    const scheduled = days.reduce((n, d) => n + d.posts.length, 0);
    const shown = chipPosts(rows, chip);
    const counts = (c: PostChip) => rows.filter((p) => inChip(p, c)).length;

    return (
        <div className="grid gap-7">
            {waiting.length > 0 ? (
                <Notice
                    tone="warning"
                    data-social-waiting=""
                    action={
                        <IntentLink
                            href="/social?tab=channels"
                            className="font-semibold underline underline-offset-4"
                        >
                            {SOCIAL_WORDS.reconnect}
                        </IntentLink>
                    }
                >
                    {waiting
                        .map(
                            (c) =>
                                `${CHANNEL_NAMES[c.kind]} needs reconnecting. ${count(c.waitingPosts, "post waits", "posts wait")}.`,
                        )
                        .join(" ")}
                </Notice>
            ) : null}
            {channelsRead ? null : (
                <FailedRead things={SOCIAL_WORDS.channelsFailed} />
            )}
            {posts.ok ? null : <FailedRead things={SOCIAL_WORDS.postsFailed} />}
            {posts.ok ? (
                <section aria-labelledby="next-days" className="grid gap-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <h2
                            id="next-days"
                            className="flex-1 text-[17px] font-semibold"
                        >
                            {SOCIAL_WORDS.nextDays}
                        </h2>
                        <span className="text-[12.5px] text-muted-foreground">
                            {`${count(scheduled, "scheduled", "scheduled")} · ${SOCIAL_WORDS.goodTimeWhat}`}
                        </span>
                    </div>
                    <ul
                        className={cn(
                            "grid gap-2.5",
                            narrow
                                ? "grid-cols-[minmax(0,1fr)]"
                                : "grid-cols-7",
                        )}
                    >
                        {days.map((d) => (
                            <li
                                key={d.key}
                                data-week-day={d.key}
                                className={cn(
                                    "flex min-w-0 gap-2 rounded-xl border bg-card p-2.5",
                                    narrow
                                        ? "items-center"
                                        : "min-h-[190px] flex-col",
                                    d.today
                                        ? "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                                        : "border-border",
                                )}
                            >
                                <h3
                                    className={cn(
                                        "text-[12.5px] font-semibold text-muted-foreground",
                                        narrow && "w-[88px] shrink-0",
                                    )}
                                >
                                    {d.label}
                                </h3>
                                {d.posts.length > 0 ? (
                                    <div
                                        className={cn(
                                            "flex min-w-0 gap-2",
                                            narrow
                                                ? "flex-1 flex-wrap"
                                                : "flex-col",
                                        )}
                                    >
                                        {d.posts.map((p) => (
                                            <IntentLink
                                                key={p.id}
                                                href={postHref(p.id)}
                                                scroll={false}
                                                data-week-post={p.id}
                                                className={cn(
                                                    "flex min-w-0 items-center gap-1.5 rounded-lg text-center text-[11.5px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                                    narrow
                                                        ? "flex-row text-left"
                                                        : "flex-col",
                                                )}
                                            >
                                                <PostThumb
                                                    post={p}
                                                    className={
                                                        narrow
                                                            ? "w-9"
                                                            : "w-[64px]"
                                                    }
                                                />
                                                <span className="min-w-0">
                                                    {narrow ? (
                                                        <b
                                                            data-ph-mask=""
                                                            className="block truncate text-[13px] font-semibold text-foreground"
                                                        >
                                                            {p.title}
                                                        </b>
                                                    ) : (
                                                        <span className="sr-only">
                                                            {p.title}
                                                        </span>
                                                    )}
                                                    {joinFacts(
                                                        p.publishAt
                                                            ? formatTime(
                                                                  p.publishAt,
                                                                  zone,
                                                              )
                                                            : null,
                                                        channelList(
                                                            p.channels.map(
                                                                (c) => c.kind,
                                                            ),
                                                            true,
                                                        ),
                                                    )}
                                                </span>
                                            </IntentLink>
                                        ))}
                                    </div>
                                ) : (
                                    <div
                                        className={cn(
                                            "flex min-w-0 flex-1 gap-2",
                                            narrow
                                                ? "items-center justify-between"
                                                : "flex-col items-center justify-center",
                                        )}
                                    >
                                        {canPost ? (
                                            <IntentLink
                                                href={newPostOn(
                                                    d.key,
                                                    d.goodTimeAt,
                                                )}
                                                data-add-post={d.key}
                                                className="inline-flex min-h-11 items-center text-[12.5px] font-semibold underline decoration-border-strong underline-offset-4"
                                            >
                                                {SOCIAL_WORDS.addPost}
                                            </IntentLink>
                                        ) : null}
                                        {d.goodTime ? (
                                            <span className="text-[11.5px] text-muted-foreground">
                                                {SOCIAL_WORDS.goodTime(
                                                    d.goodTime,
                                                )}
                                            </span>
                                        ) : null}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
            {posts.ok ? (
                <section aria-labelledby="posted-drafts" className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2
                            id="posted-drafts"
                            className="flex-1 text-[17px] font-semibold"
                        >
                            {SOCIAL_WORDS.postedAndDrafts}
                        </h2>
                        <ChipGroup
                            label={SOCIAL_WORDS.postedAndDrafts}
                            value={chip}
                            onChange={setChip}
                            choices={POST_CHIPS.map((c) => {
                                const n = counts(c);
                                return {
                                    value: c,
                                    label:
                                        c === "all" || n === 0
                                            ? SOCIAL_WORDS.filterNames[c]
                                            : `${SOCIAL_WORDS.filterNames[c]} ${n}`,
                                    data: { "data-chip": c },
                                };
                            })}
                        />
                    </div>
                    {shown.length === 0 ? (
                        rows.length === 0 ? (
                            <EmptyState
                                size="panel"
                                title={SOCIAL_WORDS.noPostsYet}
                                description={SOCIAL_WORDS.noPostsWhat}
                            />
                        ) : (
                            <p
                                data-chip-empty={chip}
                                className="py-6 text-center text-[14px] text-muted-foreground"
                            >
                                {SOCIAL_WORDS.filterEmpty[chip]}
                            </p>
                        )
                    ) : (
                        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
                            {shown.map((p) => {
                                const pill = postPill(p);
                                return (
                                    <li
                                        key={p.id}
                                        data-social-post={p.id}
                                        data-status={p.status}
                                        className="grid content-start gap-2"
                                    >
                                        <IntentLink
                                            href={postHref(p.id)}
                                            scroll={false}
                                            className="relative flex justify-center rounded-2xl bg-muted p-3.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <StatusBadge
                                                tone={pill.tone}
                                                className="absolute left-2.5 top-2.5 z-10"
                                                data-ph-unmask=""
                                            >
                                                {pill.word}
                                            </StatusBadge>
                                            <PostThumb
                                                post={p}
                                                className="w-full max-w-[180px]"
                                            />
                                            <span className="sr-only">
                                                {p.title}
                                            </span>
                                        </IntentLink>
                                        <b
                                            data-ph-mask=""
                                            className="line-clamp-2 text-[14.5px] font-semibold leading-[1.3]"
                                        >
                                            {p.title}
                                        </b>
                                        <small className="text-[12.5px] text-muted-foreground">
                                            {postLine(p, zone)}
                                        </small>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            ) : null}
        </div>
    );
}
