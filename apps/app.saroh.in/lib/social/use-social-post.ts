"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";

import { askForMorePosts, savePost } from "./saroh-social-actions";
import type {
    ChannelKind,
    SocialAccess,
    SocialChannel,
    SocialPostInput,
} from "./saroh-social-types";
import {
    meterOf,
    threadsFit,
    whenWords,
    workingKinds,
} from "./saroh-social-view";
import { SOCIAL_WORDS } from "./saroh-social-words";

/** What Create post knows about Saroh Social, read once on the server. */
export interface SocialCompose {
    access: SocialAccess;
    channels: SocialChannel[];
    /** The channels couldn't be read: none can be switched on. */
    channelsFailed: boolean;
    /** `?at=`: the time a day's "Add a post" asked for. */
    at: string | null;
    /** `?day=`: the day a day's "Add a post" asked for, its time to pick. */
    day: string | null;
}

/** In place of Saroh Social where it isn't on: the hook runs, nothing uses it. */
export const NO_SOCIAL: SocialCompose = {
    access: {
        state: "unavailable",
        canPost: false,
        canBuy: false,
        plan: null,
        upgradeTo: null,
        usage: null,
        goodTimes: [],
    },
    channels: [],
    channelsFailed: false,
    at: null,
    day: null,
};

/**
 * Saroh Social's half of Create post (board BSocialDesk; S4): which
 * channels it goes to, each one's own words, when, and the saves. The
 * post itself (item, card, size, caption, link) is the composer's; it is
 * handed in as `base` at the moment of saving. Logic only (DEC-183): the
 * panel draws it.
 */
export function useSocialPost({
    social,
    base,
    text,
    link,
    zone,
}: {
    social: SocialCompose;
    /** The post as it stands, for a save; null while it can't be saved yet. */
    base: () => SocialPostInput | null;
    /** The caption's words, without the link. */
    text: string;
    /** The item's live address, for each channel's length. */
    link: string;
    zone: string;
}) {
    const router = useRouter();
    const [on, setOn] = useState<ChannelKind[]>(() =>
        workingKinds(social.channels),
    );
    const [captions, setCaptions] = useState<
        Partial<Record<ChannelKind, string>>
    >({});
    const [editing, setEditing] = useState<ChannelKind | null>(null);
    const [busy, setBusy] = useState<"schedule" | "now" | "draft" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [full, setFull] = useState(
        () =>
            social.access.usage !== null &&
            meterOf(social.access.usage, zone).full,
    );
    const [requested, setRequested] = useState(
        social.access.usage?.requested ?? false,
    );
    const [picking, setPicking] = useState(false);
    // The good time to offer: the first still a few minutes off when it opened.
    const [openedAt] = useState(() => Date.now());
    const at =
        social.at ??
        social.access.goodTimes.find(
            (g) => Date.parse(g) > openedAt + 5 * 60_000,
        ) ??
        null;

    const toggle = (kind: ChannelKind, value: boolean) =>
        setOn((now) =>
            value
                ? now.includes(kind)
                    ? now
                    : [...now, kind]
                : now.filter((k) => k !== kind),
        );
    const setCaption = (kind: ChannelKind, value: string | null) =>
        setCaptions((c) => {
            const next = { ...c };
            if (value === null) delete next[kind];
            else next[kind] = value;
            return next;
        });

    const threads = on.includes("THREADS")
        ? threadsFit(
              captions.THREADS ?? text,
              link,
              captions.THREADS !== undefined,
          )
        : null;
    const blocked =
        on.length === 0
            ? SOCIAL_WORDS.pickAChannel
            : threads?.state === "over"
              ? SOCIAL_WORDS.threadsOver(threads.bytes)
              : null;

    async function save(
        action: "schedule" | "now" | "draft",
        publishAt?: string,
    ): Promise<boolean> {
        const post = base();
        if (!post) {
            // Never a press that does nothing: say what it needs.
            setError(SOCIAL_WORDS.nothingToPost);
            return false;
        }
        if (action !== "draft" && blocked) {
            setError(blocked);
            return false;
        }
        setError(null);
        const res = await runAction(
            () =>
                savePost(null, {
                    ...post,
                    channels: on,
                    captions:
                        Object.keys(captions).length > 0 ? captions : null,
                    action,
                    ...(publishAt ? { publishAt } : {}),
                }),
            {
                setBusy: (b) => setBusy(b ? action : null),
                quiet: true,
                onUnreached: setError,
            },
        );
        if (!res) return false;
        if (!res.ok) {
            // The month is used up: the When part becomes the limit (S7).
            if (res.plan) setFull(true);
            else setError(res.error);
            return false;
        }
        showSuccess(
            action === "draft"
                ? SOCIAL_WORDS.draftSaved
                : action === "now"
                  ? SOCIAL_WORDS.postingNow
                  : SOCIAL_WORDS.scheduledFor(
                        whenWords(res.data.publishAt ?? publishAt ?? "", zone),
                    ),
        );
        router.push(`/social?post=${encodeURIComponent(res.data.id)}`);
        return true;
    }

    async function requestMore() {
        const res = await runAction(askForMorePosts);
        if (!res) return;
        if (!res.ok) return showError(res.error);
        setRequested(true);
    }

    return {
        on,
        toggle,
        captions,
        setCaption,
        editing,
        setEditing,
        busy,
        error,
        full,
        requested,
        requestMore,
        threads,
        blocked,
        at,
        picking,
        setPicking,
        schedule: (when: string) => save("schedule", when),
        postNow: () => save("now"),
        saveDraft: () => save("draft"),
    };
}

export type SocialPostState = ReturnType<typeof useSocialPost>;
