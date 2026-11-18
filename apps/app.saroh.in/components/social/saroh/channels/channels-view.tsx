"use client";

import { Button } from "@saroh/ui/button";
import { FailedRead } from "@saroh/ui/failed-read";
import { Notice } from "@saroh/ui/notice";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeleteMenu } from "@/components/shared/confirm/delete-menu";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { runAction } from "@/lib/api/run-action";
import { formatDate } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { disconnect, postHeld } from "@/lib/social/saroh-social-actions";
import type {
    ChannelKind,
    PageChoice,
    Read,
    SocialChannel,
    SocialParams,
} from "@/lib/social/saroh-social-types";
import { CHANNEL_KINDS, PICKER_KINDS } from "@/lib/social/saroh-social-types";
import {
    attentionLine,
    CHANNEL_NAMES,
    connectResultLine,
    SOCIAL_WORDS,
} from "@/lib/social/saroh-social-words";

import { ChannelIcon } from "./channel-icon";
import { ConnectButton } from "./connect-sheet";
import { PagePicker } from "./page-picker";

const kindOf = (value: string | null): ChannelKind | null => {
    const kind = value?.toUpperCase();
    return CHANNEL_KINDS.find((k) => k === kind) ?? null;
};

/**
 * Social › Channels (S2): three fixed rows, one per kind, so one of each
 * needs no error of its own. Each says its state in a pill and offers one
 * action. Coming back from Meta, the row's line says how it went, once.
 */
export function ChannelsView({
    channels,
    canPost,
    params,
    pages,
}: {
    channels: Read<SocialChannel[]>;
    canPost: boolean;
    params: SocialParams;
    /** The Pages (or Instagram accounts) to pick from, when a sign-in offers several. */
    pages: Read<PageChoice[]> | null;
}) {
    const router = useRouter();
    if (!channels.ok) {
        return (
            <FailedRead
                size="panel"
                things={SOCIAL_WORDS.channelsFailed}
                onRetry={() => router.refresh()}
            />
        );
    }
    const back = kindOf(params.channel);
    const result = back && params.result ? params.result : null;
    const line = back && result ? connectResultLine(back, result) : null;
    return (
        <div className="grid max-w-[760px] gap-4">
            {back && result === "connected" ? (
                <Notice tone="success" data-connect-result="connected">
                    {`${CHANNEL_NAMES[back]} is connected.`}
                </Notice>
            ) : null}
            {line ? (
                <Notice
                    tone="error"
                    role="alert"
                    data-connect-result={result ?? ""}
                >
                    {line}
                </Notice>
            ) : null}
            <ul className="grid divide-y divide-border rounded-xl border border-border bg-card">
                {channels.data.map((c) => (
                    <li key={c.kind}>
                        <ChannelRow channel={c} canPost={canPost} />
                    </li>
                ))}
            </ul>
            <p className="text-[12.5px] text-muted-foreground">
                {SOCIAL_WORDS.oneEach}
            </p>
            {back &&
            PICKER_KINDS.includes(back) &&
            result === "choose" &&
            params.choice ? (
                <PagePicker
                    kind={back}
                    choiceId={params.choice}
                    pages={pages}
                    onClose={() =>
                        router.replace("/social?tab=channels", {
                            scroll: false,
                        })
                    }
                />
            ) : null}
        </div>
    );
}

function ChannelRow({
    channel,
    canPost,
}: {
    channel: SocialChannel;
    canPost: boolean;
}) {
    const router = useRouter();
    const zone = useBusinessZone();
    const [busy, setBusy] = useState(false);
    const { kind, state } = channel;
    const name = CHANNEL_NAMES[kind];

    async function postThem() {
        const res = await runAction(() => postHeld(kind), { setBusy });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(SOCIAL_WORDS.postingNow);
        router.refresh();
    }

    return (
        <div
            data-channel={kind}
            data-channel-state={state}
            className="grid gap-2.5 px-4 py-3.5"
        >
            <div className="flex flex-wrap items-center gap-3">
                <ChannelIcon kind={kind} />
                <div className="min-w-0 flex-1">
                    <b className="block text-[14.5px] font-semibold">{name}</b>
                    <span
                        data-ph-mask=""
                        className="block truncate text-[13px] text-muted-foreground"
                    >
                        {channel.handle ?? SOCIAL_WORDS.notConnected}
                    </span>
                </div>
                {state === "CONNECTED" ? (
                    <StatusBadge tone="success" data-ph-unmask="">
                        {SOCIAL_WORDS.connected}
                    </StatusBadge>
                ) : state === "NEEDS_ATTENTION" ? (
                    <StatusBadge tone="warning" data-ph-unmask="">
                        {SOCIAL_WORDS.needsAttention}
                    </StatusBadge>
                ) : null}
                {canPost && state !== "CONNECTED" ? (
                    <ConnectButton
                        channel={channel}
                        variant={
                            state === "NOT_CONNECTED" ? "outline" : "default"
                        }
                        className={
                            state === "NOT_CONNECTED" ? "bg-card" : undefined
                        }
                    />
                ) : null}
                {canPost && state !== "NOT_CONNECTED" ? (
                    <DeleteMenu
                        name={name}
                        verb={SOCIAL_WORDS.disconnect}
                        keep={SOCIAL_WORDS.keepIt}
                        title={SOCIAL_WORDS.disconnectTitle(kind)}
                        description={SOCIAL_WORDS.disconnectWhat}
                        onDelete={() => disconnect(kind)}
                        done={() => SOCIAL_WORDS.disconnected(kind)}
                        then="/social?tab=channels"
                    />
                ) : null}
            </div>
            {state === "NEEDS_ATTENTION" && channel.attention ? (
                <p className="text-pretty text-[13.5px] text-foreground">
                    {attentionLine(
                        kind,
                        channel.attention.reason,
                        formatDate(channel.attention.since, zone),
                    )}
                </p>
            ) : null}
            {state === "CONNECTED" && channel.heldPosts > 0 && canPost ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1">
                        {`${count(channel.heldPosts, "post", "posts")} waited while it was signed out.`}
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void postThem()}
                        busy={busy}
                        busyLabel={SOCIAL_WORDS.posting}
                        data-post-held={kind}
                    >
                        {SOCIAL_WORDS.postThemNow}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
