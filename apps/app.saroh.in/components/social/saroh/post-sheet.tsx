"use client";

import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { FailedRead } from "@saroh/ui/failed-read";
import { Notice } from "@saroh/ui/notice";
import { Skeleton } from "@saroh/ui/skeleton";
import { TextLink } from "@saroh/ui/text-link";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { QuickLook } from "@/components/shared/forms/quick-look";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import type { CrmResult } from "@/lib/api/http";
import { runAction } from "@/lib/api/run-action";
import { formatDate } from "@/lib/format/datetime";
import {
    cancelPost,
    deletePost,
    postResults,
    savePost,
    tryPostAgain,
} from "@/lib/social/saroh-social-actions";
import type {
    PostResults,
    Read,
    SocialAccess,
    SocialChannel,
    SocialPost,
} from "@/lib/social/saroh-social-types";
import {
    channelList,
    deliveryPill,
    postPill,
    whenWords,
} from "@/lib/social/saroh-social-view";
import {
    CHANNEL_NAMES,
    deliveryReason,
    SOCIAL_WORDS,
} from "@/lib/social/saroh-social-words";

import { ChannelIcon } from "./channels/channel-icon";
import { PostThumb } from "./post-thumb";
import { TimeDialog } from "./time-dialog";

type Asking = "time" | "cancel" | "delete" | null;

/**
 * One post (S5, S6; Hootsuite's side panel): its picture and words, when,
 * each channel's state with its link or the one reason it didn't post and
 * its fix, and what its link brought. A side sheet on a desk, from the
 * foot of the screen on a phone. A failed channel is fixed here alone; it
 * doesn't count again.
 */
export function PostSheet({
    post,
    access,
    channels,
    canPost,
    narrow,
    onClose,
}: {
    post: SocialPost;
    access: SocialAccess;
    channels: SocialChannel[];
    canPost: boolean;
    narrow: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const zone = useBusinessZone();
    const [asking, setAsking] = useState<Asking>(null);
    const [busy, setBusy] = useState(false);
    const [caption, setCaption] = useState(post.caption);
    const pill = postPill(post);
    const gone = post.status === "DONE" || post.status === "PARTLY_DONE";
    // Held with every channel still waiting: never sent, so it can be
    // cancelled or deleted outright (S-02).
    const heldUnsent =
        post.held && post.channels.every((c) => c.status === "WAITING");
    const started = !post.canEdit && post.status !== "CANCELLED" && !heldUnsent;
    const failed = post.channels.filter((c) => c.status === "FAILED");

    /** A write: said once, the list refreshed; false keeps a dialog open. */
    async function run(
        write: () => Promise<CrmResult<unknown>>,
        done: string,
        close = false,
    ): Promise<boolean> {
        const res = await runAction(write, { setBusy });
        if (!res) return false;
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(done);
        if (close) onClose();
        router.refresh();
        return true;
    }

    const postNow = () =>
        run(
            () => savePost(post.id, { action: "now" }),
            SOCIAL_WORDS.postingNow,
        );
    const pickTime = (at: string) =>
        post.status === "DRAFT"
            ? run(
                  () =>
                      savePost(post.id, { action: "schedule", publishAt: at }),
                  SOCIAL_WORDS.scheduledFor(whenWords(at, zone)),
              )
            : failed.length > 0
              ? run(
                    () => tryPostAgain(post.id, at),
                    SOCIAL_WORDS.scheduledFor(whenWords(at, zone)),
                )
              : run(
                    () => savePost(post.id, { publishAt: at }),
                    SOCIAL_WORDS.moved(whenWords(at, zone)),
                );

    const actions = canPost ? (
        <div className="flex flex-wrap gap-2">
            {post.status === "DRAFT" || post.status === "SCHEDULED" ? (
                <>
                    <Button
                        type="button"
                        onClick={() => setAsking("time")}
                        data-post-action="time"
                    >
                        {post.status === "DRAFT"
                            ? SOCIAL_WORDS.scheduleAt
                            : SOCIAL_WORDS.move}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="bg-card"
                        busy={busy}
                        busyLabel={SOCIAL_WORDS.posting}
                        onClick={() => void postNow()}
                        data-post-action="now"
                    >
                        {SOCIAL_WORDS.postNow}
                    </Button>
                </>
            ) : null}
            {failed.length > 0 ? (
                <Button
                    type="button"
                    busy={busy}
                    busyLabel={SOCIAL_WORDS.posting}
                    onClick={() =>
                        void run(
                            () => tryPostAgain(post.id),
                            SOCIAL_WORDS.tryingAgain,
                        )
                    }
                    data-post-action="again"
                >
                    {SOCIAL_WORDS.tryAgain}
                </Button>
            ) : null}
            {post.status === "SCHEDULED" || heldUnsent ? (
                <Button
                    type="button"
                    variant="outline"
                    className="bg-card"
                    onClick={() => setAsking("cancel")}
                >
                    {SOCIAL_WORDS.cancel}
                </Button>
            ) : null}
            <Button
                type="button"
                variant="ghost"
                onClick={() => setAsking("delete")}
                data-post-action="delete"
            >
                {started ? SOCIAL_WORDS.remove : SOCIAL_WORDS.delete}
            </Button>
        </div>
    ) : null;

    return (
        <QuickLook
            open
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
            side={narrow ? "bottom" : "right"}
            title={<span data-ph-mask="">{post.title}</span>}
            subtitle={
                post.publishAt
                    ? whenWords(post.publishAt, zone)
                    : SOCIAL_WORDS.draft
            }
            status={
                <StatusBadge tone={pill.tone} data-ph-unmask="">
                    {pill.word}
                </StatusBadge>
            }
            description={`${pill.word}: ${post.title}`}
            footer={actions}
        >
            <div data-post-sheet={post.id} className="grid gap-4 p-[18px]">
                {post.status === "PARTLY_DONE" && failed.length > 0 ? (
                    <Notice tone="warning" data-post-partly="">
                        {SOCIAL_WORDS.partly(
                            channelList(
                                post.channels
                                    .filter((c) => c.status === "POSTED")
                                    .map((c) => c.kind),
                            ),
                            channelList(failed.map((c) => c.kind)),
                        )}
                    </Notice>
                ) : null}
                <div className="flex gap-4 rounded-xl border border-border bg-card p-3.5">
                    <PostThumb post={post} className="w-[96px]" />
                    {post.canEdit && canPost ? (
                        <CaptionEdit
                            caption={caption}
                            onCaption={setCaption}
                            changed={caption !== post.caption}
                            busy={busy}
                            onSave={() =>
                                void run(
                                    () => savePost(post.id, { caption }),
                                    SOCIAL_WORDS.captionSaved,
                                )
                            }
                        />
                    ) : (
                        <p
                            data-ph-mask=""
                            className="min-w-0 flex-1 whitespace-pre-line text-pretty text-[13.5px]"
                        >
                            {post.caption}
                        </p>
                    )}
                </div>
                <section className="grid gap-2">
                    <h3 className="text-[14px] font-semibold">
                        {SOCIAL_WORDS.channelsHeading}
                    </h3>
                    <ul className="grid divide-y divide-border rounded-xl border border-border bg-card">
                        {post.channels.map((d) => (
                            <li
                                key={d.kind}
                                data-delivery={d.kind}
                                data-delivery-status={d.status}
                                className="grid gap-1.5 px-3.5 py-3"
                            >
                                <div className="flex items-center gap-2.5">
                                    <ChannelIcon kind={d.kind} />
                                    <b className="min-w-0 flex-1 text-[14px] font-semibold">
                                        {CHANNEL_NAMES[d.kind]}
                                    </b>
                                    <StatusBadge
                                        tone={deliveryPill(d).tone}
                                        data-ph-unmask=""
                                    >
                                        {deliveryPill(d).word}
                                    </StatusBadge>
                                </div>
                                {d.status === "POSTED" && d.permalink ? (
                                    <a
                                        href={d.permalink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex min-h-11 w-fit items-center gap-1.5 text-[13px] font-semibold underline decoration-border-strong underline-offset-4"
                                    >
                                        {SOCIAL_WORDS.openOn(d.kind)}
                                        <ExternalLink
                                            aria-hidden
                                            className="size-3.5"
                                        />
                                    </a>
                                ) : null}
                                {d.status === "FAILED" ||
                                (d.status === "WAITING" &&
                                    (d.reason === "attention" ||
                                        d.reason === "off")) ? (
                                    <Reason
                                        delivery={d}
                                        canPost={canPost}
                                        connected={channels.some(
                                            (c) =>
                                                c.kind === d.kind &&
                                                c.state === "CONNECTED",
                                        )}
                                        onTime={() => setAsking("time")}
                                    />
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
                {gone ? <Results post={post} /> : null}
            </div>
            <TimeDialog
                open={asking === "time"}
                title={
                    post.status === "SCHEDULED"
                        ? SOCIAL_WORDS.moveTitle
                        : SOCIAL_WORDS.pickTitle
                }
                saveLabel={
                    post.status === "SCHEDULED"
                        ? SOCIAL_WORDS.moveTo
                        : SOCIAL_WORDS.scheduleAt
                }
                initial={
                    failed.find((d) => d.retryAfter)?.retryAfter ??
                    (post.status === "SCHEDULED" ? post.publishAt : null)
                }
                goodTimes={access.goodTimes}
                onClose={() => setAsking(null)}
                onPick={pickTime}
            />
            <ConfirmDialog
                open={asking === "cancel"}
                onOpenChange={(o) => setAsking(o ? "cancel" : null)}
                title={SOCIAL_WORDS.cancelTitle}
                description={SOCIAL_WORDS.cancelWhat}
                confirmLabel={SOCIAL_WORDS.cancel}
                keepLabel={SOCIAL_WORDS.keepScheduled}
                onConfirm={async () => ({
                    ok: await run(
                        () => cancelPost(post.id),
                        SOCIAL_WORDS.cancelledDone,
                    ),
                })}
            />
            <ConfirmDialog
                open={asking === "delete"}
                onOpenChange={(o) => setAsking(o ? "delete" : null)}
                title={
                    started
                        ? SOCIAL_WORDS.removeTitle
                        : SOCIAL_WORDS.deleteTitle
                }
                description={
                    started ? SOCIAL_WORDS.removeWhat : SOCIAL_WORDS.deleteWhat
                }
                confirmLabel={
                    started ? SOCIAL_WORDS.remove : SOCIAL_WORDS.delete
                }
                keepLabel={SOCIAL_WORDS.keepIt}
                onConfirm={async () => ({
                    ok: await run(
                        () => deletePost(post.id),
                        started ? SOCIAL_WORDS.removed : SOCIAL_WORDS.deleted,
                        true,
                    ),
                })}
            />
        </QuickLook>
    );
}

function CaptionEdit({
    caption,
    onCaption,
    changed,
    busy,
    onSave,
}: {
    caption: string;
    onCaption: (v: string) => void;
    changed: boolean;
    busy: boolean;
    onSave: () => void;
}) {
    return (
        <div className="grid min-w-0 flex-1 gap-2">
            <Textarea
                aria-label={SOCIAL_WORDS.captionLabel}
                value={caption}
                onChange={(e) => onCaption(e.target.value)}
                rows={4}
                data-ph-mask=""
                data-post-caption=""
            />
            {changed ? (
                <Button
                    type="button"
                    size="sm"
                    className="w-fit"
                    busy={busy}
                    busyLabel="Saving…"
                    onClick={onSave}
                >
                    {SOCIAL_WORDS.saveCaption}
                </Button>
            ) : null}
        </div>
    );
}

/** Why one channel didn't post, and its one fix (S6). */
function Reason({
    delivery,
    canPost,
    connected,
    onTime,
}: {
    delivery: SocialPost["channels"][number];
    canPost: boolean;
    connected: boolean;
    onTime: () => void;
}) {
    const zone = useBusinessZone();
    const after = delivery.retryAfter
        ? whenWords(delivery.retryAfter, zone)
        : null;
    const { line, fix } = deliveryReason(delivery.kind, delivery.reason, after);
    return (
        <div
            className="grid gap-1.5"
            data-delivery-reason={delivery.reason ?? "unknown"}
        >
            <p className="text-pretty text-[13px] text-foreground">{line}</p>
            {!canPost ? null : (fix === "reconnect" || fix === "connect") &&
              !connected ? (
                <Link
                    href="/social?tab=channels"
                    className="inline-flex min-h-11 w-fit items-center text-[13px] font-semibold underline decoration-border-strong underline-offset-4"
                >
                    {fix === "connect"
                        ? SOCIAL_WORDS.connect(delivery.kind)
                        : SOCIAL_WORDS.reconnect}
                </Link>
            ) : fix === "time" ? (
                <TextLink onClick={onTime} className="w-fit font-semibold">
                    {SOCIAL_WORDS.pickNewTime}
                </TextLink>
            ) : null}
        </div>
    );
}

/**
 * What the post's link brought (S5): visits, and how many of those paid.
 * Counts only: the API keeps no amounts per link. Zero is "Nothing yet",
 * a failed read is said, never a 0.
 */
function Results({ post }: { post: SocialPost }) {
    const zone = useBusinessZone();
    const [read, setRead] = useState<Read<PostResults> | null>(null);
    const [tries, setTries] = useState(0);
    useEffect(() => {
        let live = true;
        void postResults(post.id)
            .then((r) => live && setRead(r))
            .catch(() => live && setRead({ ok: false }));
        return () => {
            live = false;
        };
    }, [post.id, tries]);

    return (
        <section data-post-results="" className="grid gap-2">
            <h3 className="text-[14px] font-semibold">{SOCIAL_WORDS.result}</h3>
            {read === null ? (
                <Skeleton className="h-14 w-full rounded-xl" />
            ) : !read.ok ? (
                <FailedRead
                    things={SOCIAL_WORDS.resultsFailed}
                    onRetry={() => {
                        setRead(null);
                        setTries((n) => n + 1);
                    }}
                />
            ) : read.data.visits === 0 && read.data.paid === 0 ? (
                <p className="text-[13.5px] text-muted-foreground">
                    {SOCIAL_WORDS.nothingYet}
                </p>
            ) : (
                <div className="grid gap-0.5 rounded-xl border border-border bg-card px-3.5 py-3">
                    {read.data.paid > 0 ? (
                        <b className="text-[15px] font-semibold">
                            {SOCIAL_WORDS.paid(read.data.paid)}
                        </b>
                    ) : null}
                    <span className="text-[13.5px]">
                        {SOCIAL_WORDS.visits(read.data.visits)}
                    </span>
                    {read.data.from ? (
                        <span className="text-[12.5px] text-muted-foreground">
                            {SOCIAL_WORDS.resultsSince(
                                formatDate(read.data.from, zone),
                            )}
                        </span>
                    ) : null}
                </div>
            )}
        </section>
    );
}
