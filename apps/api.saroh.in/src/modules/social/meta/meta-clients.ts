import type { FetchFn } from "./graph-http";
import { expiresIn, metaCall, query } from "./graph-http";
import type {
    ChannelKind,
    ConnectedAccount,
    ContainerKind,
    ContainerStatus,
    ExpiringKind,
    FacebookPages,
    ImagePost,
    PageKind,
    PlatformPost,
    SocialMetaPort,
} from "./social-meta.port";
import { SCOPES, SocialMetaError } from "./social-meta.port";

/**
 * Meta's logins and their publishing APIs with plain `fetch` (U3):
 * Facebook Login for Business with Page tokens (graph.facebook.com) for
 * Facebook Pages and for Instagram, and Threads (graph.threads.com).
 * Graph v27.0, Threads v1.0. Token exchanges send the app secret and the
 * short token as Meta asks, in the request; every call for an account
 * sends its token in the Authorization header.
 *
 * Instagram (owner, 18 Nov 2026): Meta no longer offers "API setup with
 * Instagram login" to newer apps, so Instagram is the Instagram API with
 * Facebook Login, under its own login configuration
 * (META_IG_LOGIN_CONFIG_ID). The person signs in with Facebook; each Page
 * they manage names its linked Instagram professional account
 * (`instagram_business_account`); Saroh keeps that account's id and the
 * Page's token, and publishes on graph.facebook.com. Meta's docs:
 * - get started: developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
 *   (`/me/accounts`, `instagram_business_account`, `instagram_basic`, `pages_show_list`)
 * - content publishing: developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing
 *   (`/<IG_ID>/media`, `status_code`, `/<IG_ID>/media_publish`,
 *   `/<IG_ID>/content_publishing_limit`; "Facebook Login: Facebook Page access token")
 * - content_publishing_limit: developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit
 *   (`quota_usage`, `config.quota_total`)
 * - Facebook Login for Business: developers.facebook.com/docs/facebook-login/facebook-login-for-business
 *   (`config_id`, `response_type=code`, `override_default_response_type`)
 * The limit read's token (S-05, checked 18 Nov 2026): the
 * content_publishing_limit reference's Requirements table, for the
 * Instagram API with Facebook Login, names a "Facebook User access token"
 * (`instagram_basic`, `instagram_content_publish`,
 * `pages_read_engagement`), while the content-publishing guide's table
 * names a "Facebook Page access token" for the path as a whole. Saroh
 * keeps only the Page token, so the read is best effort: the publish step
 * treats any refusal of it as "no pre-check" (`platform-steps.ts`) and
 * lets the publish call say if the limit is reached; it never marks the
 * channel signed out. Unconfirmed until tried against Meta: a caption on
 * `/media` is shown in Meta's examples but not its parameter list.
 */

export const GRAPH_VERSION = "v27.0";
export const THREADS_VERSION = "v1.0";

/** Facebook Login for Business: the Meta app, and one of its login configurations. */
export interface FacebookLogin {
    appId: string;
    appSecret: string;
    configId: string;
}

export interface MetaKeys {
    facebook: FacebookLogin | null;
    /** The same Meta app, under the Instagram login configuration. */
    instagram: FacebookLogin | null;
    threads: { appId: string; appSecret: string } | null;
}

export interface MetaBases {
    facebookAuth: string;
    facebookGraph: string;
    threadsAuth: string;
    threadsGraph: string;
}

export const META_BASES: MetaBases = {
    facebookAuth: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    facebookGraph: `https://graph.facebook.com/${GRAPH_VERSION}`,
    threadsAuth: "https://threads.com/oauth/authorize",
    threadsGraph: "https://graph.threads.com",
};

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
        return (
            (kind === "THREADS"
                ? this.keys.threads
                : this.keys[loginOf(kind)]) !== null
        );
    }

    authorizeUrl(
        kind: ChannelKind,
        input: { redirectUri: string; state: string },
    ): string {
        switch (kind) {
            case "INSTAGRAM":
            case "FACEBOOK": {
                const fb = this.login(kind);
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
                    client_id: this.threads().appId,
                    redirect_uri: input.redirectUri,
                    response_type: "code",
                    scope: SCOPES.THREADS.join(","),
                    state: input.state,
                })}`;
        }
    }

    async connect(
        _kind: ExpiringKind,
        code: string,
        redirectUri: string,
    ): Promise<ConnectedAccount> {
        const app = this.threads();
        const short = tokenOf(
            await metaCall<TokenAnswer & { data?: TokenAnswer[] }>(
                this.fetchFn,
                `${this.bases.threadsGraph}/oauth/access_token`,
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
        const graph = this.bases.threadsGraph;
        const long = await metaCall<TokenAnswer>(
            this.fetchFn,
            `${graph}/access_token${query({
                grant_type: "th_exchange_token",
                client_secret: app.appSecret,
                access_token: shortToken,
            })}`,
        );
        const token = need(long.access_token, "long-lived token");
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

    async pageAccounts(
        kind: PageKind,
        code: string,
        redirectUri: string,
    ): Promise<FacebookPages> {
        const fb = this.login(kind);
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
        interface Accounts {
            data?: {
                id?: string;
                name?: string;
                access_token?: string;
                picture?: { data?: { url?: string } };
                instagram_business_account?: {
                    id?: string;
                    username?: string;
                    profile_picture_url?: string;
                };
            }[];
            paging?: { next?: string };
        }
        // Every Page, following Meta's pages of 100 (S-13), up to 500.
        const data: NonNullable<Accounts["data"]> = [];
        let next: string | undefined = `${graph}/me/accounts${query({
            fields:
                kind === "INSTAGRAM"
                    ? "id,name,access_token,instagram_business_account{id,username,profile_picture_url}"
                    : "id,name,access_token,picture{url}",
            limit: "100",
        })}`;
        for (let i = 0; next && i < 5; i++) {
            const page: Accounts = await metaCall<Accounts>(
                this.fetchFn,
                next,
                {
                    token: userToken,
                },
            );
            data.push(...(page.data ?? []));
            const more = page.paging?.next;
            // Only Meta's own Graph address is followed.
            next = more?.startsWith(`${graph}/`) ? more : undefined;
        }
        const platformUserId = need(str(me.id), "user id");
        const pages = data.flatMap((p) =>
            p.id && p.access_token
                ? [{ ...p, id: p.id, access_token: p.access_token }]
                : [],
        );
        // A Page token from a long-lived user token doesn't expire.
        if (kind === "FACEBOOK") {
            return {
                platformUserId,
                pages: pages.map((p) => ({
                    accountId: p.id,
                    platformUserId,
                    handle: p.name ?? p.id,
                    avatarUrl: p.picture?.data?.url ?? null,
                    token: p.access_token,
                    tokenExpiresAt: null,
                })),
            };
        }
        // Instagram: only Pages with a linked professional account.
        return {
            platformUserId,
            pages: pages.flatMap((p) => {
                const ig = p.instagram_business_account;
                const igId = str(ig?.id);
                return igId
                    ? [
                          {
                              accountId: igId,
                              platformUserId,
                              handle: `@${str(ig?.username) ?? igId}`,
                              avatarUrl: str(ig?.profile_picture_url),
                              token: p.access_token,
                              tokenExpiresAt: null,
                              pageId: p.id,
                          },
                      ]
                    : [];
            }),
        };
    }

    async refresh(
        _kind: ExpiringKind,
        token: string,
    ): Promise<{ token: string; expiresAt: Date }> {
        const answer = await metaCall<TokenAnswer>(
            this.fetchFn,
            `${this.bases.threadsGraph}/refresh_access_token${query({
                grant_type: "th_refresh_token",
                access_token: token,
            })}`,
        );
        return {
            token: need(answer.access_token, "refreshed token"),
            expiresAt: expiresIn(answer.expires_in),
        };
    }

    async publishLimit(
        kind: ContainerKind,
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
        kind: ContainerKind,
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
        kind: ContainerKind,
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
        kind: ContainerKind,
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
                limit: "25",
            })}`,
            { token },
        );
        const hit = (answer.data ?? []).find((p) =>
            (str(p[words]) ?? "").includes(ref),
        );
        const id = hit ? str(hit.id) : null;
        return id ? { id, permalink: str(hit?.[link]) } : null;
    }

    /** The versioned API an account's calls go to. */
    private api(kind: ChannelKind): string {
        return kind === "THREADS"
            ? `${this.bases.threadsGraph}/${THREADS_VERSION}`
            : this.bases.facebookGraph;
    }

    private threads(): { appId: string; appSecret: string } {
        if (!this.keys.threads) throw new MetaNotSetUpError("THREADS");
        return this.keys.threads;
    }

    private login(kind: PageKind): FacebookLogin {
        const login = this.keys[loginOf(kind)];
        if (!login) throw new MetaNotSetUpError(kind);
        return login;
    }
}

const loginOf = (kind: PageKind) =>
    kind === "INSTAGRAM" ? "instagram" : "facebook";

/** A login whose keys aren't set on this API: connecting it answers 503. */
export class MetaNotSetUpError extends Error {
    constructor(readonly kind: ChannelKind) {
        super(`${kind} keys are not set on this API`);
        this.name = "MetaNotSetUpError";
    }
}
