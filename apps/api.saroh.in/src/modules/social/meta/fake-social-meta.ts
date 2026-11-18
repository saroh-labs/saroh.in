/* eslint-disable @typescript-eslint/require-await -- a stand-in for a network port: async, so a failure it is told to give rejects as Meta's would */
import type {
    ChannelKind,
    ConnectedAccount,
    ContainerStatus,
    ExpiringKind,
    FacebookPages,
    ImagePost,
    MetaErrorKind,
    PlatformPost,
    SocialMetaPort,
} from "./social-meta.port";
import { SocialMetaError } from "./social-meta.port";

type Method = keyof SocialMetaPort;

interface FakePost extends PlatformPost {
    accountId: string;
    caption: string;
    imageUrl: string;
}

/**
 * Meta in memory, for tests and the browser specs (`SOCIAL_FAKE=1`, U3).
 *
 * - Consent comes straight back: the authorize address is the callback
 *   with `code=fake-<kind>`, so a browser lands where Meta would send it.
 *   `fake-personal` connects a personal Instagram account.
 * - Facebook signs in with `pages` Pages (one by default; set more to see
 *   the picker).
 * - Posts are kept per account, and a container finishes at once unless
 *   `stuck` is set.
 * - `failNext(method, kind)` makes the next call of that method fail that
 *   way; `limit` is what the publishing limit reads.
 */
export class FakeSocialMeta implements SocialMetaPort {
    pages = 1;
    stuck = false;
    limit: { used: number; total: number } | null = { used: 0, total: 100 };
    readonly posts: FakePost[] = [];
    readonly calls: { method: Method; kind?: ChannelKind }[] = [];
    private readonly containers = new Map<
        string,
        { status: ContainerStatus; accountId: string; post: ImagePost }
    >();
    private readonly failures: { method: Method; error: SocialMetaError }[] =
        [];
    private n = 0;

    /** The next `method` call fails as `kind`. */
    failNext(method: Method, kind: MetaErrorKind, retryAfter?: Date): void {
        this.failures.push({
            method,
            error: new SocialMetaError(
                kind,
                `fake ${kind}`,
                retryAfter ?? null,
            ),
        });
    }

    reset(): void {
        this.pages = 1;
        this.stuck = false;
        this.limit = { used: 0, total: 100 };
        this.posts.length = 0;
        this.calls.length = 0;
        this.containers.clear();
        this.failures.length = 0;
    }

    available(): boolean {
        return true;
    }

    authorizeUrl(
        kind: ChannelKind,
        input: { redirectUri: string; state: string },
    ): string {
        const url = new URL(input.redirectUri);
        url.searchParams.set("code", `fake-${kind.toLowerCase()}`);
        url.searchParams.set("state", input.state);
        return url.toString();
    }

    async connect(kind: ExpiringKind, code: string): Promise<ConnectedAccount> {
        this.take("connect", kind);
        const personal = code === "fake-personal";
        const name =
            kind === "INSTAGRAM" ? "chaiandcrumb" : "chaiandcrumb.threads";
        return {
            accountId: `${kind.toLowerCase()}-account-1`,
            platformUserId: `${kind.toLowerCase()}-user-1`,
            handle: `@${name}`,
            avatarUrl: null,
            token: `fake-token-${kind.toLowerCase()}-${++this.n}`,
            tokenExpiresAt: new Date(Date.now() + 60 * 86_400_000),
            ...(kind === "INSTAGRAM"
                ? { accountType: personal ? "PERSONAL" : "BUSINESS" }
                : {}),
        };
    }

    async facebookPages(): Promise<FacebookPages> {
        this.take("facebookPages", "FACEBOOK");
        return {
            platformUserId: "facebook-user-1",
            pages: Array.from({ length: this.pages }, (_, i) => ({
                accountId: `page-${i + 1}`,
                platformUserId: "facebook-user-1",
                handle: i === 0 ? "Chai & Crumb" : `Chai & Crumb ${i + 1}`,
                avatarUrl: null,
                token: `fake-page-token-${i + 1}`,
                tokenExpiresAt: null,
            })),
        };
    }

    async refresh(
        kind: ExpiringKind,
    ): Promise<{ token: string; expiresAt: Date }> {
        this.take("refresh", kind);
        return {
            token: `fake-token-${kind.toLowerCase()}-${++this.n}`,
            expiresAt: new Date(Date.now() + 60 * 86_400_000),
        };
    }

    async publishLimit(
        kind: ExpiringKind,
    ): Promise<{ used: number; total: number } | null> {
        this.take("publishLimit", kind);
        return this.limit;
    }

    async createContainer(
        kind: ExpiringKind,
        accountId: string,
        _token: string,
        post: ImagePost,
    ): Promise<string> {
        this.take("createContainer", kind);
        const id = `container-${++this.n}`;
        this.containers.set(id, {
            status: this.stuck ? "IN_PROGRESS" : "FINISHED",
            accountId,
            post,
        });
        return id;
    }

    async containerStatus(
        kind: ExpiringKind,
        containerId: string,
    ): Promise<ContainerStatus> {
        this.take("containerStatus", kind);
        return this.containers.get(containerId)?.status ?? "EXPIRED";
    }

    async publishContainer(
        kind: ExpiringKind,
        accountId: string,
        _token: string,
        containerId: string,
    ): Promise<string> {
        const container = this.containers.get(containerId);
        if (container?.status !== "FINISHED") {
            throw new SocialMetaError("unknown", "container not finished");
        }
        // A publish that happened, then the answer was lost: the post is
        // there, and the call fails as asked.
        const id = this.keep(kind, accountId, container.post);
        container.status = "PUBLISHED";
        this.take("publishContainer", kind);
        return id;
    }

    async postPhoto(
        pageId: string,
        _token: string,
        post: ImagePost,
    ): Promise<string> {
        const failure = this.failures.findIndex(
            (f) => f.method === "postPhoto",
        );
        // `retry` on a write: it went through and the answer was lost.
        if (failure >= 0 && this.failures[failure].error.kind === "retry") {
            this.keep("FACEBOOK", pageId, post);
        }
        this.take("postPhoto", "FACEBOOK");
        return this.keep("FACEBOOK", pageId, post);
    }

    async permalink(kind: ChannelKind, postId: string): Promise<string | null> {
        this.take("permalink", kind);
        return this.posts.find((p) => p.id === postId)?.permalink ?? null;
    }

    async findByRef(
        kind: ChannelKind,
        accountId: string,
        _token: string,
        ref: string,
    ): Promise<PlatformPost | null> {
        this.take("findByRef", kind);
        const hit = this.posts.find(
            (p) => p.accountId === accountId && p.caption.includes(ref),
        );
        return hit ? { id: hit.id, permalink: hit.permalink } : null;
    }

    private keep(
        kind: ChannelKind,
        accountId: string,
        post: ImagePost,
    ): string {
        const id = `${kind.toLowerCase()}-post-${++this.n}`;
        this.posts.push({
            id,
            accountId,
            caption: post.caption,
            imageUrl: post.imageUrl,
            permalink: `https://example.com/${kind.toLowerCase()}/${id}`,
        });
        return id;
    }

    private take(method: Method, kind?: ChannelKind): void {
        this.calls.push({ method, kind });
        const i = this.failures.findIndex((f) => f.method === method);
        if (i >= 0) {
            const [failure] = this.failures.splice(i, 1);
            throw failure.error;
        }
    }
}

/** The one fake this process uses under `SOCIAL_FAKE=1`. */
export const fakeSocialMeta = new FakeSocialMeta();
