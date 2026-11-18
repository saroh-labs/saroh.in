/**
 * Everything Saroh Social asks of Meta (plan saroh-social 2026-11-18-001,
 * U3): the three logins, their tokens, and publishing an image post. One
 * port, so the connect flow and the publish job run on the real clients
 * (`meta-clients.ts`) or, in tests, the fake (`fake-social-meta.ts`).
 *
 * Calls that act for an account take its token; nothing here stores one.
 * Nothing logs a token or a caption.
 */

/** The DI token for the port, or null when nothing of Meta is set up. */
export const SOCIAL_META = Symbol("SOCIAL_META");

export const CHANNEL_KINDS = ["INSTAGRAM", "FACEBOOK", "THREADS"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** The channels whose token Saroh must refresh: Facebook Page tokens don't expire. */
export type ExpiringKind = Exclude<ChannelKind, "FACEBOOK">;

/**
 * What went wrong, as Saroh acts on it:
 * - `auth`: the token is refused, expired or revoked (190, OAuthException,
 *   401). The channel needs reconnecting.
 * - `limit`: a publishing or rate limit. Try again at `retryAfter`.
 * - `media`: the platform refused the picture (size, shape, format).
 * - `retry`: Meta's own error (5xx, 429 for a rate, a dropped connection or
 *   a timeout). Try again later; for a write, Saroh doesn't know whether it
 *   happened.
 * - `unknown`: anything else Meta answered no to.
 */
export type MetaErrorKind = "auth" | "limit" | "media" | "retry" | "unknown";

export class SocialMetaError extends Error {
    constructor(
        readonly kind: MetaErrorKind,
        /** Words for logs and a delivery's reason: a status and Meta's code, never a token. */
        readonly detail: string,
        readonly retryAfter: Date | null = null,
    ) {
        super(`Meta ${kind}: ${detail}`);
        this.name = "SocialMetaError";
    }
}

export const isMetaError = (
    error: unknown,
    kind?: MetaErrorKind,
): error is SocialMetaError =>
    error instanceof SocialMetaError && (!kind || error.kind === kind);

/** An account a person connected, with its token. */
export interface ConnectedAccount {
    /** The account Saroh posts as. */
    accountId: string;
    /** Who signed in at Meta: what the deauthorize and deletion callbacks name. */
    platformUserId: string;
    /** "@handle", or a Page's name. */
    handle: string;
    avatarUrl: string | null;
    token: string;
    /** Null: the token doesn't expire (a Page's). */
    tokenExpiresAt: Date | null;
    /**
     * Instagram only: BUSINESS or MEDIA_CREATOR can publish; anything else
     * (a personal account) can't.
     */
    accountType?: string | null;
}

/** A Facebook sign-in: the person, and each Page they manage with its Page token. */
export interface FacebookPages {
    platformUserId: string;
    pages: ConnectedAccount[];
}

/** A container's state on Instagram or Threads. */
export type ContainerStatus =
    "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";

/** A post on the platform. */
export interface PlatformPost {
    id: string;
    permalink: string | null;
}

/** What an image post carries. */
export interface ImagePost {
    /** A public JPEG Meta fetches. */
    imageUrl: string;
    caption: string;
}

export interface SocialMetaPort {
    /** Whether this login's keys are set here, so it can be connected. */
    available(kind: ChannelKind): boolean;
    /** The consent page to send the person to. */
    authorizeUrl(
        kind: ChannelKind,
        input: { redirectUri: string; state: string },
    ): string;
    /** Instagram or Threads: the code traded for a long-lived token and the profile. */
    connect(
        kind: ExpiringKind,
        code: string,
        redirectUri: string,
    ): Promise<ConnectedAccount>;
    /** Facebook: the code traded for the person's Pages, each with a Page token. */
    facebookPages(code: string, redirectUri: string): Promise<FacebookPages>;
    /** A long-lived Instagram or Threads token, refreshed (at least 24 hours old). */
    refresh(
        kind: ExpiringKind,
        token: string,
    ): Promise<{ token: string; expiresAt: Date }>;
    /**
     * The account's publishing allowance now (Instagram's rolling 24
     * hours, Threads' 250 a day); null when Meta didn't say.
     */
    publishLimit(
        kind: ExpiringKind,
        accountId: string,
        token: string,
    ): Promise<{ used: number; total: number } | null>;
    /** Instagram or Threads: a media container for the picture and words. */
    createContainer(
        kind: ExpiringKind,
        accountId: string,
        token: string,
        post: ImagePost,
    ): Promise<string>;
    containerStatus(
        kind: ExpiringKind,
        containerId: string,
        token: string,
    ): Promise<ContainerStatus>;
    /** Publish a finished container: the post's id. */
    publishContainer(
        kind: ExpiringKind,
        accountId: string,
        token: string,
        containerId: string,
    ): Promise<string>;
    /** Facebook: a photo post on the Page, in one call: the post's id. */
    postPhoto(pageId: string, token: string, post: ImagePost): Promise<string>;
    /** A published post's public address, or null when Meta didn't give one. */
    permalink(
        kind: ChannelKind,
        postId: string,
        token: string,
    ): Promise<string | null>;
    /**
     * The account's recent post whose words carry `ref` (Saroh's link), or
     * null: how an unclear publish is checked before anything is sent
     * again.
     */
    findByRef(
        kind: ChannelKind,
        accountId: string,
        token: string,
        ref: string,
    ): Promise<PlatformPost | null>;
}

/** The scopes each login asks for: only what posting needs. */
export const SCOPES: Record<ChannelKind, readonly string[]> = {
    INSTAGRAM: [
        "instagram_business_basic",
        "instagram_business_content_publish",
    ],
    // Facebook Login for Business takes its permissions from the login
    // configuration (`config_id`); these are what that configuration holds.
    FACEBOOK: [
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
    ],
    THREADS: ["threads_basic", "threads_content_publish"],
};
