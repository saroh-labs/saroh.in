import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import type { ChannelKind } from "./saroh-social-types";

/**
 * Every word Saroh Social's own screens say (research §8): "Post",
 * "Schedule", "Post now", "Move", "Didn't post", "Reconnect", "Needs
 * attention", "Try again", "channel". Create post's words are
 * `words.ts`, the Share sheet's `share-item/words.ts`.
 */

/** A channel as its row names it. */
export const CHANNEL_NAMES: Record<ChannelKind, string> = {
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook Page",
    THREADS: "Threads",
};

/** A channel in a short list or a preview tab. */
export const CHANNEL_SHORT: Record<ChannelKind, string> = {
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    THREADS: "Threads",
};

/** What a channel needs, said before Meta's own screen (S2). */
export const CONNECT_NEEDS: Record<ChannelKind, readonly string[]> = {
    INSTAGRAM: [
        "A Business or Creator account on Instagram, linked to a Facebook Page you manage.",
        "You'll sign in with Facebook and pick the Instagram account linked to your Page.",
        "Saroh posts only what you schedule here.",
    ],
    FACEBOOK: [
        "A Facebook Page you manage.",
        "You'll sign in on Facebook and pick the Page.",
        "Saroh posts only what you schedule here.",
    ],
    THREADS: [
        "A Threads profile.",
        "You'll sign in on Threads and allow Saroh to post.",
        "A private profile signs Saroh out every 90 days. Saroh tells you a week before.",
    ],
};

export const SOCIAL_WORDS = {
    social: "Social",
    channels: "Channels",
    posts: "Posts",
    newPost: "New post",
    connect: (kind: ChannelKind) => `Connect ${CHANNEL_SHORT[kind]}`,
    connectTitle: (kind: ChannelKind) => `Connect ${CHANNEL_NAMES[kind]}`,
    reconnectTitle: (kind: ChannelKind) => `Reconnect ${CHANNEL_NAMES[kind]}`,
    connectWhat: "What you need",
    continue: "Continue",
    connecting: "Opening…",
    connected: "Connected",
    notConnected: "Not connected",
    needsAttention: "Needs attention",
    reconnect: "Reconnect",
    disconnect: "Disconnect",
    disconnectTitle: (kind: ChannelKind) =>
        `Disconnect ${CHANNEL_NAMES[kind]}?`,
    disconnectWhat:
        "Saroh stops posting to it and forgets its sign-in. Posts that were to go there won't. Your posts on it stay where they are.",
    disconnected: (kind: ChannelKind) =>
        `${CHANNEL_NAMES[kind]} is disconnected.`,
    keepIt: "Keep it",
    channelsWhat:
        "One Instagram account, one Facebook Page and one Threads profile. Saroh posts to them for you.",
    channelsLead: "Where Saroh posts for you.",
    notSetUp: "This channel can't be connected on Saroh yet.",
    oneEach: "One of each. To use another account, disconnect this one first.",
    pickPage: "Pick the Page Saroh posts to",
    pickPageWhat: "That sign-in manages more than one Page.",
    usePage: "Use this Page",
    pickAccount: "Pick the Instagram account Saroh posts to",
    pickAccountWhat: "Your Pages have more than one Instagram account linked.",
    useAccount: "Use this account",
    pageLoadFailed: (kind: ChannelKind) =>
        `Couldn't load your Pages. Connect ${CHANNEL_SHORT[kind]} again.`,
    postThemNow: "Post them now",
    // The posts page (board BSocialHomeSocialDesk).
    nextDays: "Next 7 days",
    addPost: "Add a post",
    goodTime: (time: string) => `Good time ${time}`,
    goodTimeWhat:
        "Good times are Saroh's suggestions for now: weekday evenings, weekend lunchtimes.",
    postedAndDrafts: "Posted and drafts",
    all: "All",
    filterNames: {
        all: "All",
        scheduled: "Scheduled",
        posted: "Posted",
        failed: "Didn't post",
        draft: "Drafts",
    },
    noPostsYet: "No posts yet",
    noPostsWhat: "Your posts show here once you make one.",
    filterEmpty: {
        all: "No posts yet.",
        scheduled: "Nothing scheduled.",
        posted: "Nothing posted yet.",
        failed: "Every post went out.",
        draft: "No drafts.",
    },
    connectFirst: "Connect a channel to start",
    connectFirstWhat:
        "Saroh posts to your Instagram, Facebook Page and Threads. Connect one and your first post can be ready in a minute.",
    more: (name: string) => `More for ${name}`,
    // Statuses, as a pill says them.
    draft: "Draft",
    scheduled: "Scheduled",
    posting: "Posting",
    posted: "Posted",
    didntPost: "Didn't post",
    cancelled: "Cancelled",
    waitsReconnect: "Waits for you",
    // The post's sheet (S5, S6).
    when: "When",
    channelsHeading: "Channels",
    openOn: (kind: ChannelKind) => `Open on ${CHANNEL_SHORT[kind]}`,
    result: "What it brought",
    nothingYet: "Nothing yet. Results show here as people open the link.",
    visits: (n: number) =>
        count(n, "visit from this post", "visits from this post"),
    paid: (n: number) =>
        `Brought ${count(n, "order or booking", "orders or bookings")}`,
    resultsSince: (since: string) => `Since ${since}, from its link`,
    resultsFailed: "results",
    notPosted: "Not posted yet. Results show here once it goes out.",
    edit: "Edit caption",
    move: "Move",
    postNow: "Post now",
    tryAgain: "Try again",
    pickNewTime: "Pick a new time",
    cancel: "Cancel post",
    cancelTitle: "Cancel this post?",
    cancelWhat:
        "It won't go out, and it stops counting towards this month's posts. You can still see it here.",
    keepScheduled: "Keep it",
    delete: "Delete post",
    deleteTitle: "Delete this post?",
    deleteWhat: "It goes from Saroh. Nothing has been posted from it.",
    remove: "Remove from Saroh",
    removeTitle: "Remove this post from Saroh?",
    removeWhat:
        "It goes from Saroh only. Where it was posted, it stays: delete it there if you want it gone.",
    deleted: "Post deleted.",
    removed: "Post removed from Saroh.",
    cancelledDone: "Post cancelled.",
    moved: (when: string) => `Moved to ${when}.`,
    scheduledFor: (when: string) => `Scheduled for ${when}.`,
    postingNow: "Posting now. It shows here as each channel answers.",
    tryingAgain: "Trying again.",
    captionSaved: "Caption changed.",
    saveCaption: "Save caption",
    captionLabel: "Caption",
    partly: (posted: string, failed: string) =>
        `Posted to ${posted}. ${failed} didn't post.`,
    // Move and Pick a time.
    pickTime: "Pick a time",
    moveTitle: "Move this post",
    pickTitle: "When should it go out?",
    pickWhat: (zone: string) => `Times are in ${zone}.`,
    date: "Date",
    time: "Time",
    goodTimeLink: (when: string) => `Use the good time, ${when}`,
    pickDate: "Pick a date.",
    tooSoon: "Pick a time at least a few minutes from now.",
    scheduleAt: "Schedule",
    moveTo: "Move",
    // The composer (board BSocialDesk).
    readyFor: "Your post is ready for Instagram, Facebook and Threads.",
    postTo: "Post to",
    postToChannel: (kind: ChannelKind) => `Post to ${CHANNEL_NAMES[kind]}`,
    scheduleFor: (when: string) => `Schedule for ${when}`,
    scheduleGood:
        "Saroh's suggested time: weekday evenings, weekend lunchtimes.",
    countsAs: (limit: number | null, nextMonth: string | null) =>
        nextMonth
            ? `Counts in ${nextMonth}${limit === null ? "" : `, 1 of your ${formatNumber(limit)} posts`}. The link is tagged so you can see what it brings.`
            : limit === null
              ? "The link is tagged so you can see what it brings."
              : `Counts as 1 of your ${formatNumber(limit)} posts this month. The link is tagged so you can see what it brings.`,
    shareYourself: "Or share it yourself: download, copy, WhatsApp",
    backToSchedule: "Post it with Saroh instead",
    saveDraft: "Save as draft",
    draftSaved: "Saved as a draft.",
    pickAChannel: "Switch on a channel to post to.",
    nothingToPost: "Write a headline or add a photo first.",
    storyNotPosted:
        "Saroh posts Post and Square sizes. Pick one of those to post it.",
    editFor: (kind: ChannelKind) => `Edit for ${CHANNEL_SHORT[kind]}`,
    useMain: "Use the main caption",
    previewOn: "Preview on",
    previewNote: "Close to how it will look. Each app may crop a little.",
    linkInBio: "Link in bio",
    threadsCut: (bytes: number) =>
        `Threads takes 500 bytes with the link. This is ${formatNumber(bytes)}, so Threads gets the start of it with “…”. Edit for Threads to choose the words.`,
    threadsOver: (bytes: number) =>
        `Threads takes 500 bytes with the link. This is ${formatNumber(bytes)}. Shorten it to post to Threads.`,
    leaveLost: "this post",
    // The meter and the limit (S7).
    used: (used: number, limit: number | null) =>
        limit === null
            ? `${count(used, "post", "posts")} this month`
            : `${formatNumber(used)} of ${formatNumber(limit)} posts this month`,
    left: (left: number, resets: string) =>
        `${count(left, "post", "posts")} left this month, more from ${resets}`,
    usedAll: (limit: number, month: string) =>
        `You've used your ${formatNumber(limit)} posts for ${month}`,
    usedAllWhat: (resets: string) =>
        `Posts already scheduled still go out. More from ${resets}.`,
    requestMore: "Request more",
    requested: "Asked. Saroh will be in touch about more posts.",
    shareFree: "Share from your phone, free",
    meterUnknown: "Posts this month not known",
    connectedLine: (names: string, n: number) =>
        `${names} ${n === 1 ? "is" : "are"} connected.`,
    noneConnected: "No channel connected yet.",
    // The locked card (S1).
    lockedTitle: "Post to Instagram, Facebook and Threads from Saroh",
    lockedWhat:
        "Turn a product, class or offer into a post in your look, schedule it, and see the visits and orders it brings. One post to all your channels counts once.",
    shareForFree:
        "Sharing from your phone is free on every plan. Open any product and tap Share.",
    couldntCheck: "Couldn't check your plan. Try again.",
    channelsFailed: "your channels",
    postsFailed: "your posts",
    // The data deletion page (U8).
    deletionTitle: "Your data was deleted",
    deletionWhat: (n: number, kind: string, when: string) =>
        `On ${when}, Saroh deleted ${count(n, "connected channel", "connected channels")} for ${kind} and the sign-in it held. Posts already published stay on ${kind}.`,
    deletionCode: (code: string) => `Confirmation code: ${code}`,
    deletionMissing: "No deletion request has that code.",
    deletionMissingWhat:
        "Check the link Meta gave you. If it is right, the request may not have reached Saroh yet.",
} as const;

/**
 * How a connect came back (`?result=` on the return address), said once
 * in Channels. Null for `connected` and `choose`, which the row and the
 * Page picker say themselves.
 */
export function connectResultLine(
    kind: ChannelKind,
    result: string,
): string | null {
    const name = CHANNEL_NAMES[kind];
    switch (result) {
        case "connected":
        case "choose":
            return null;
        case "denied":
            return `${name} didn't connect: Saroh wasn't allowed to post. Connect again when you're ready.`;
        case "invalid":
        case "expired":
            return `${name} didn't connect: the sign-in took too long. Try again.`;
        case "someone-else":
            return `${name} didn't connect: the sign-in was finished by someone else. Connect it while signed in to Saroh as yourself.`;
        case "no-instagram":
            return "Instagram didn't connect: link your Instagram professional account to a Facebook Page first. In Instagram, open Settings › Accounts Center, add your Facebook Page, then connect again.";
        case "no-pages":
            return "Facebook didn't connect: that sign-in manages no Page. Make a Page on Facebook, or sign in as someone who manages one.";
        case "refused":
            return `${name} didn't connect: your role or your plan doesn't reach Saroh Social here.`;
        case "unavailable":
            return `${name} can't be connected on Saroh yet.`;
        default:
            return `${name} didn't connect, and didn't say why. Try again.`;
    }
}

/** Why a channel needs reconnecting, in a sentence (S2). */
export function attentionLine(
    kind: ChannelKind,
    reason: string | null,
    since: string,
): string {
    const name = CHANNEL_NAMES[kind];
    const wait = `Posts to it won't go out until you reconnect.`;
    switch (reason) {
        case "expired":
            return `Saroh's sign-in to ${name} ran out on ${since}. ${wait}`;
        case "grant-ended":
            return `Threads ended Saroh's access on ${since}, as it does every 90 days for a private profile. ${wait}`;
        default:
            return `${name} signed Saroh out on ${since}. ${wait}`;
    }
}

/**
 * Why one channel of a post didn't go, and the one fix (S6). `after` is
 * when a limit lifts, already in words.
 */
export function deliveryReason(
    kind: ChannelKind,
    reason: string | null,
    after: string | null,
): { line: string; fix: "reconnect" | "time" | "again" | "connect" } {
    const name = CHANNEL_SHORT[kind];
    switch (reason) {
        case "auth":
        case "attention":
            return {
                line: `${name} signed Saroh out. Reconnect and Saroh will post it.`,
                fix: "reconnect",
            };
        case "limit":
            return {
                line: after
                    ? `${name}'s daily limit for your account was reached. Post it after ${after}.`
                    : `${name}'s daily limit for your account was reached. Post it later.`,
                fix: "time",
            };
        case "media":
            return {
                line: `${name} didn't accept the picture. Try again, or make the post with another look.`,
                fix: "again",
            };
        case "stuck":
            return {
                line: `${name} didn't take it in time. Try again.`,
                fix: "again",
            };
        case "disconnected":
            return {
                line: `${name} was disconnected before it went out.`,
                fix: "connect",
            };
        case "reconnected":
            return {
                line: `${name} is now connected to another account, so it didn't go there. Try again to post it there.`,
                fix: "again",
            };
        case "off":
            return {
                line: "Saroh Social wasn't on for your business when it was due. Try again.",
                fix: "again",
            };
        case "site":
            return {
                line: "Your website wasn't live when it was due, so its link would have led nowhere. Try again once it is live.",
                fix: "again",
            };
        default:
            return {
                line: `${name} didn't take it and didn't say why. Try again.`,
                fix: "again",
            };
    }
}
