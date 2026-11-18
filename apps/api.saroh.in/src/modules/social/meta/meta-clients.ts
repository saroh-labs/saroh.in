import type { FetchFn } from "./graph-http";
import { expiresIn, metaCall, query } from "./graph-http";
import type {
    ChannelKind,
    ConnectedAccount,
    ContainerStatus,
    ExpiringKind,
    FacebookPages,
    ImagePost,
    PlatformPost,
    SocialMetaPort,
} from "./social-meta.port";
import { SCOPES, SocialMetaError } from "./social-meta.port";

/**
 * Meta's three logins and their publishing APIs with plain `fetch` (U3):
 * Instagram API with Instagram Login (graph.instagram.com, no Page
 * needed), Facebook Login for Business with Page tokens
 * (graph.facebook.com), and Threads (graph.threads.com). Graph v27.0,
 * Threads v1.0. Token exchanges send the app secret and the short token as
 * Meta asks, in the request; every call for an account sends its token
 * in the Authorization header.
 */

export const GRAPH_VERSION = "v27.0";
export const THREADS_VERSION = "v1.0";

export interface MetaKeys {
    /** Facebook Login for Business: the Meta app, and its login configuration. */
    facebook: { appId: string; appSecret: string; configId: string } | null;
    instagram: { appId: string; appSecret: string } | null;
    threads: { appId: string; appSecret: string } | null;
}

export interface MetaBases {
    instagramAuth: string;
    instagramToken: string;
    instagramGraph: string;
    facebookAuth: string;
    facebookGraph: string;
    threadsAuth: string;
    threadsGraph: string;
}

export const META_BASES: MetaBases = {
    instagramAuth: "https://www.instagram.com/oauth/authorize",
    instagramToken: "https://api.instagram.com/oauth/access_token",
    instagramGraph: "https://graph.instagram.com",
    facebookAuth: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    facebookGraph: `https://graph.facebook.com/${GRAPH_VERSION}`,
    threadsAuth: "https://threads.com/oauth/authorize",
    threadsGraph: "https://graph.threads.com",
};

/** Instagram accounts that can publish through the API. */
export const PUBLISHING_ACCOUNT_TYPES = new Set(["BUSINESS", "MEDIA_CREATOR"]);

interface TokenAnswer {
    access_token?: string;
    user_id?: string | number;
    expires_in?: number;
}

interface Limit {
    data?: { quota_usage?: number; config?: { quota_total?: number } }[];
}

const str = (v: unknown): string | null =>
    typeof v === "string" && v !== ""
        ? v
        : typeof v === "number"
          ? String(v)
          : null;

function need(value: string | null | undefined, what: string): string {
    if (!value) throw new SocialMetaError("unknown", `missing ${what}`);
    return value;
}

/** The first token answer's fields, whether Meta wraps them in `data` or not. */
function tokenOf(answer: TokenAnswer & { data?: TokenAnswer[] }): TokenAnswer {
    return answer.data?.[0] ?? answer;
}

export class SocialMetaClient implements SocialMetaPort {
    private readonly bases: MetaBases;

    constructor(
        private readonly keys: MetaKeys,
        options: { fetchFn?: FetchFn; bases?: Partial<MetaBases> } = {},
    ) {
        this.bases = { ...META_BASES, ...options.bases };
        this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    }

    private readonly fetchFn: FetchFn;

    available(kind: ChannelKind): boolean {
        return kind === "FACEBOOK"
            ? this.keys.facebook !== null
            : (kind === "INSTAGRAM"
                  ? this.keys.instagram
                  : this.keys.threads) !== null;
    }

    authorizeUrl(
        kind: ChannelKind,
        input: { redirectUri: string; state: string },
    ): string {
        switch (kind) {
            case "INSTAGRAM":
                return `${this.bases.instagramAuth}${query({
                    client_id: this.app("INSTAGRAM").appId,
                    redirect_uri: input.redirectUri,
                    response_type: "code",
                    scope: SCOPES.INSTAGRAM.join(","),
                    state: input.state,
                })}`;
            case "FACEBOOK": {
                const fb = this.facebook();
                return `${this.bases.facebookAuth}${query({
                    client_id: fb.appId,
                    redirect_uri: input.redirectUri,
                    response_type: "code",
                    config_id: fb.configId,
                    override_default_response_type: "true",
                    state: input.state,
                })}`;
            }
            case "THREADS":
                return `${this.bases.threadsAuth}${query({
                    client_id: this.app("THREADS").appId,
                    redirect_uri: input.redirectUri,
                    response_type: "code",
                    scope: SCOPES.THREADS.join(","),
                    state: input.state,
                })}`;
        }
    }

    async connect(
        kind: ExpiringKind,
        code: string,
        redirectUri: string,
    ): Promise<ConnectedAccount> {
        const app = this.app(kind);
        const short = tokenOf(
            await metaCall<TokenAnswer & { data?: TokenAnswer[] }>(
                this.fetchFn,
                kind === "INSTAGRAM"
                    ? this.bases.instagramToken
                    : `${this.bases.threadsGraph}/oauth/access_token`,
                {
                    form: {
                        client_id: app.appId,
                        client_secret: app.appSecret,
                        grant_type: "authorization_code",
                        redirect_uri: redirectUri,
                        code,
                    },
                },
            ),
        );
        const shortToken = need(short.access_token, "token");
        const userId = need(str(short.user_id), "user id");
        const graph = this.graphOf(kind);
        const long = await metaCall<TokenAnswer>(
            this.fetchFn,
            `${graph}/access_token${query({
                grant_type:
                    kind === "INSTAGRAM"
                        ? "ig_exchange_token"
                        : "th_exchange_token",
                client_secret: app.appSecret,
                access_token: shortToken,
            })}`,
        );
        const token = need(long.access_token, "long-lived token");
        if (kind === "INSTAGRAM") {
            const me = await metaCall<Record<string, unknown>>(
                this.fetchFn,
                `${graph}/${GRAPH_VERSION}/me${query({
                    fields: "user_id,username,account_type,profile_picture_url",
                })}`,
                { token },
            );
            return {
                accountId: str(me.user_id) ?? userId,
                platformUserId: userId,
                handle: `@${str(me.username) ?? userId}`,
                avatarUrl: str(me.profile_picture_url),
                token,
                tokenExpiresAt: expiresIn(long.expires_in),
                accountType: str(me.account_type),
            };
        }
        const me = await metaCall<Record<string, unknown>>(
            this.fetchFn,
            `${graph}/${THREADS_VERSION}/me${query({
                fields: "id,username,threads_profile_picture_url",
            })}`,
            { token },
        );
        return {
            accountId: str(me.id) ?? userId,
            platformUserId: userId,
            handle: `@${str(me.username) ?? userId}`,
            avatarUrl: str(me.threads_profile_picture_url),
            token,
            tokenExpiresAt: expiresIn(long.expires_in),
        };
    }

    async facebookPages(
        code: string,
        redirectUri: string,
    ): Promise<FacebookPages> {
        const fb = this.facebook();
        const graph = this.bases.facebookGraph;
        const short = await metaCall<TokenAnswer>(
            this.fetchFn,
            `${graph}/oauth/access_token${query({
                client_id: fb.appId,
                client_secret: fb.appSecret,
                redirect_uri: redirectUri,
                code,
            })}`,
        );
        const long = await metaCall<TokenAnswer>(
            this.fetchFn,
            `${graph}/oauth/access_token${query({
                grant_type: "fb_exchange_token",
                client_id: fb.appId,
                client_secret: fb.appSecret,
                fb_exchange_token: need(short.access_token, "token"),
            })}`,
        );
        const userToken = need(long.access_token, "long-lived token");
        const me = await metaCall<{ id?: string }>(
            this.fetchFn,
            `${graph}/me${query({ fields: "id" })}`,
            { token: userToken },
        );
        const accounts = await metaCall<{
            data?: {
                id?: string;
                name?: string;
                access_token?: string;
                picture?: { data?: { url?: string } };
            }[];
        }>(
            this.fetchFn,
            `${graph}/me/accounts${query({
                fields: "id,name,access_token,picture{url}",
                limit: "100",
            })}`,
            { token: userToken },
        );
        const platformUserId = need(str(me.id), "user id");
        return {
            platformUserId,
            pages: (accounts.data ?? [])
                .flatMap((p) =>
                    p.id && p.access_token
                        ? [{ ...p, id: p.id, access_token: p.access_token }]
                        : [],
                )
                .map((p) => ({
                    accountId: p.id,
                    platformUserId,
                    handle: p.name ?? p.id,
                    avatarUrl: p.picture?.data?.url ?? null,
                    token: p.access_token,
                    // A Page token from a long-lived user token doesn't expire.
                    tokenExpiresAt: null,
                })),
        };
    }

    async refresh(
        kind: ExpiringKind,
        token: string,
    ): Promise<{ token: string; expiresAt: Date }> {
        const answer = await metaCall<TokenAnswer>(
            this.fetchFn,
            `${this.graphOf(kind)}/refresh_access_token${query({
                grant_type:
                    kind === "INSTAGRAM"
                        ? "ig_refresh_token"
                        : "th_refresh_token",
                access_token: token,
            })}`,
        );
        return {
            token: need(answer.access_token, "refreshed token"),
            expiresAt: expiresIn(answer.expires_in),
        };
    }

    async publishLimit(
        kind: ExpiringKind,
        accountId: string,
        token: string,
    ): Promise<{ used: number; total: number } | null> {
        const answer = await metaCall<Limit>(
            this.fetchFn,
            `${this.api(kind)}/${accountId}/${
                kind === "INSTAGRAM"
                    ? "content_publishing_limit"
                    : "threads_publishing_limit"
            }${query({ fields: "quota_usage,config" })}`,
            { token },
        );
        const row = answer.data?.[0];
        const used = row?.quota_usage;
        const total = row?.config?.quota_total;
        return typeof used === "number" && typeof total === "number"
            ? { used, total }
            : null;
    }

    async createContainer(
        kind: ExpiringKind,
        accountId: string,
        token: string,
        post: ImagePost,
    ): Promise<string> {
        const answer = await metaCall<{ id?: string }>(
            this.fetchFn,
            `${this.api(kind)}/${accountId}/${kind === "INSTAGRAM" ? "media" : "threads"}`,
            {
                token,
                form:
                    kind === "INSTAGRAM"
                        ? { image_url: post.imageUrl, caption: post.caption }
                        : {
                              media_type: "IMAGE",
                              image_url: post.imageUrl,
                              text: post.caption,
                          },
            },
        );
        return need(str(answer.id), "container id");
    }

    async containerStatus(
        kind: ExpiringKind,
        containerId: string,
        token: string,
    ): Promise<ContainerStatus> {
        const field = kind === "INSTAGRAM" ? "status_code" : "status";
        const answer = await metaCall<Record<string, unknown>>(
            this.fetchFn,
            `${this.api(kind)}/${containerId}${query({ fields: field })}`,
            { token },
        );
        const status = str(answer[field]);
        return status === "FINISHED" ||
            status === "ERROR" ||
            status === "EXPIRED" ||
            status === "PUBLISHED"
            ? status
            : "IN_PROGRESS";
    }

    async publishContainer(
        kind: ExpiringKind,
        accountId: string,
        token: string,
        containerId: string,
    ): Promise<string> {
        const answer = await metaCall<{ id?: string }>(
            this.fetchFn,
            `${this.api(kind)}/${accountId}/${
                kind === "INSTAGRAM" ? "media_publish" : "threads_publish"
            }`,
            { token, form: { creation_id: containerId } },
        );
        return need(str(answer.id), "post id");
    }

    async postPhoto(
        pageId: string,
        token: string,
        post: ImagePost,
    ): Promise<string> {
        // The Page Photos reference: `url` is the picture, `message` the
        // words shown with it in the Page's feed.
        const answer = await metaCall<{ id?: string; post_id?: string }>(
            this.fetchFn,
            `${this.bases.facebookGraph}/${pageId}/photos`,
            { token, form: { url: post.imageUrl, message: post.caption } },
        );
        return need(str(answer.post_id) ?? str(answer.id), "post id");
    }

    async permalink(
        kind: ChannelKind,
        postId: string,
        token: string,
    ): Promise<string | null> {
        const field = kind === "FACEBOOK" ? "permalink_url" : "permalink";
        const answer = await metaCall<Record<string, unknown>>(
            this.fetchFn,
            `${this.api(kind)}/${postId}${query({ fields: field })}`,
            { token },
        );
        return str(answer[field]);
    }

    async findByRef(
        kind: ChannelKind,
        accountId: string,
        token: string,
        ref: string,
    ): Promise<PlatformPost | null> {
        const [edge, words, link] =
            kind === "INSTAGRAM"
                ? ["media", "caption", "permalink"]
                : kind === "FACEBOOK"
                  ? ["posts", "message", "permalink_url"]
                  : ["threads", "text", "permalink"];
        const answer = await metaCall<{ data?: Record<string, unknown>[] }>(
            this.fetchFn,
            `${this.api(kind)}/${accountId}/${edge}${query({
                fields: `id,${words},${link}`,
                limit: "10",
            })}`,
            { token },
        );
        const hit = (answer.data ?? []).find((p) =>
            (str(p[words]) ?? "").includes(ref),
        );
        const id = hit ? str(hit.id) : null;
        return id ? { id, permalink: str(hit?.[link]) } : null;
    }

    private graphOf(kind: ExpiringKind): string {
        return kind === "INSTAGRAM"
            ? this.bases.instagramGraph
            : this.bases.threadsGraph;
    }

    /** The versioned API an account's calls go to. */
    private api(kind: ChannelKind): string {
        if (kind === "FACEBOOK") return this.bases.facebookGraph;
        return kind === "INSTAGRAM"
            ? `${this.bases.instagramGraph}/${GRAPH_VERSION}`
            : `${this.bases.threadsGraph}/${THREADS_VERSION}`;
    }

    private app(kind: ExpiringKind): { appId: string; appSecret: string } {
        const app =
            kind === "INSTAGRAM" ? this.keys.instagram : this.keys.threads;
        if (!app) throw new MetaNotSetUpError(kind);
        return app;
    }

    private facebook() {
        if (!this.keys.facebook) throw new MetaNotSetUpError("FACEBOOK");
        return this.keys.facebook;
    }
}

/** A login whose keys aren't set on this API: connecting it answers 503. */
export class MetaNotSetUpError extends Error {
    constructor(readonly kind: ChannelKind) {
        super(`${kind} keys are not set on this API`);
        this.name = "MetaNotSetUpError";
    }
}
