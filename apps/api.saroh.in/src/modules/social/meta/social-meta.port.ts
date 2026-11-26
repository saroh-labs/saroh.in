/**
 * Everything Saroh Social asks of Meta (plan saroh-social 2026-11-18-001,
 * U3): Facebook Login for Business (a Page, or the Instagram account
 * linked to one) and Threads' login, their tokens, and publishing an image
 * post. One port, so the connect flow and the publish job run on the real clients
 * (`meta-clients.ts`) or, in tests, the fake (`fake-social-meta.ts`).
 *
 * Calls that act for an account take its token; nothing here stores one.
 * Nothing logs a token or a caption.
 */

/** The DI token for the port, or null when nothing of Meta is set up. */
export const SOCIAL_META = Symbol("SOCIAL_META");

export const CHANNEL_KINDS = ["INSTAGRAM", "FACEBOOK", "THREADS"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** The channels that publish through a media container: Instagram and Threads. */
export type ContainerKind = Exclude<ChannelKind, "FACEBOOK">;
/**
 * The channels whose token Saroh must refresh: only Threads. Facebook and
 * Instagram (through Facebook Login for Business) post with a Page token,
 * which doesn't expire.
 */
export type ExpiringKind = "THREADS";
/** The channels signed in with Facebook Login for Business: a Page token each. */
export type PageKind = "FACEBOOK" | "INSTAGRAM";

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
    /** Instagram only: the Facebook Page the account is linked to, whose token this is. */
    pageId?: string | null;
}

/**
 * A Facebook sign-in: the person, and each Page they manage with its Page
 * token (Facebook), or each Instagram professional account linked to one
 * of those Pages, with that Page's token (Instagram).
 */
export interface FacebookPages {
    platformUserId: string;
    pages: ConnectedAccount[];
    /**
     * What Meta showed, for the log when no Page comes back (never tokens):
     * Pages the person manages, Pages their business portfolios own, and
     * the permissions they granted or declined (null: Meta didn't say).
     */
    seen?: {
        direct: number;
        viaBusiness: number;
        granted: string[] | null;
        declined: string[] | null;
    };
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
    /** Threads: the code traded for a long-lived token and the profile. */
    connect(
        kind: ExpiringKind,
        code: string,
        redirectUri: string,
    ): Promise<ConnectedAccount>;
    /**
     * Facebook or Instagram: the code traded for the person's Pages, or the
     * Instagram accounts linked to them, each with its Page's token.
     */
    pageAccounts(
        kind: PageKind,
        code: string,
        redirectUri: string,
    ): Promise<FacebookPages>;
    /** A long-lived Threads token, refreshed (at least 24 hours old). */
    refresh(
        kind: ExpiringKind,
        token: string,
    ): Promise<{ token: string; expiresAt: Date }>;
    /**
     * The account's publishing allowance now (Instagram's rolling 24
     * hours, Threads' 250 a day); null when Meta didn't say.
     */
    publishLimit(
        kind: ContainerKind,
        accountId: string,
        token: string,
    ): Promise<{ used: number; total: number } | null>;
    /** Instagram or Threads: a media container for the picture and words. */
    createContainer(
        kind: ContainerKind,
        accountId: string,
        token: string,
        post: ImagePost,
    ): Promise<string>;
    containerStatus(
        kind: ContainerKind,
        containerId: string,
        token: string,
    ): Promise<ContainerStatus>;
    /** Publish a finished container: the post's id. */
    publishContainer(
        kind: ContainerKind,
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
    /**
     * Facebook or Instagram: take back the permissions the person who
     * signed in gave Saroh's app (`DELETE /{user-id}/permissions`, with the
     * app's own token). Every Page and Instagram account they connected
     * through it loses Saroh's access. Threads has no such call.
     */
    revoke(kind: PageKind, platformUserId: string): Promise<void>;
}

/** The scopes each login asks for: only what posting needs. */
export const SCOPES: Record<ChannelKind, readonly string[]> = {
    // Facebook Login for Business takes its permissions from the login
    // configuration (`config_id`); these are what each configuration holds.
    // `business_management`: a Page a business portfolio owns is missing
    // from `/me/accounts` without it (22 Nov 2026).
    INSTAGRAM: [
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
    ],
    FACEBOOK: [
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
        "business_management",
    ],
    THREADS: ["threads_basic", "threads_content_publish"],
};
