import "server-only";

import { getJson, orgBase } from "@/lib/api/http";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";

import { pickShareSite } from "@/lib/qr/pick";
import { listSites } from "@/lib/sites/service";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";

import type { OwnPost } from "./own-posts";
import { pickRows } from "./pick";
import type { SocialPicks, SocialPostAsk, SocialScreen } from "./queries";
import {
    ownPostsRead,
    socialPicksRead,
    socialPostRead,
    socialScreenRead,
} from "./queries";
import { readPicks } from "./read";
import {
    getSocialPost,
    listChannels,
    listSocialPosts,
    readSocialAccess,
} from "./saroh-social";
import type { SocialChannel, SocialPost } from "./saroh-social-types";

/**
 * Social's reads on the server (DEC-259): what `/api/social/*` answer
 * with, behind the page's own gate.
 */

/** Who reads Social: `social:read` while Share is switched on, as the page decides. */
export async function mayReadSocial(): Promise<boolean> {
    if (!sharePostsOn()) return false;
    // As the page's `requireCan`: no permissions known permits nothing.
    return permits(await activeOrganizationOnce(), "social:read");
}

/**
 * A channel as the screen draws it, field by field: whatever else the API
 * might one day add to a channel (a token, a Page token, a signed request)
 * never reaches the browser or its cache (KTD-6d).
 */
export function channelFacts(c: SocialChannel): SocialChannel {
    return {
        kind: c.kind,
        state: c.state,
        handle: c.handle,
        avatarUrl: c.avatarUrl,
        connectedAt: c.connectedAt,
        attention: c.attention
            ? { reason: c.attention.reason, since: c.attention.since }
            : null,
        grantEndsAt: c.grantEndsAt,
        waitingPosts: c.waitingPosts,
        heldPosts: c.heldPosts,
        canConnect: c.canConnect,
    };
}

type NoAsk = Parameters<typeof socialScreenRead.options>[1];

export const socialScreenServer: ServerRead<NoAsk, SocialScreen> = {
    read: socialScreenRead,
    service: async () => {
        const access = await readSocialAccess();
        if (!access) throw new Error("Social couldn't be checked");
        // Saroh Social isn't open here: the page draws the free Share.
        if (access.state !== "on") return null;
        const [channels, posts] = await Promise.all([
            listChannels(),
            listSocialPosts(),
        ]);
        return {
            access,
            channels: channels.ok
                ? { ok: true, data: channels.data.map(channelFacts) }
                : channels,
            posts,
        };
    },
};

/** One post; null (a 404) when it isn't this business's or couldn't be read. */
export const socialPostServer: ServerRead<SocialPostAsk, SocialPost> = {
    read: socialPostRead,
    service: async ({ id }) => {
        const post = await getSocialPost(id);
        return post.ok ? post.data : null;
    },
};

/**
 * Your posts; throws when they can't be read, and a refusal (not this
 * business's) is a 404, never an empty list.
 */
export const ownPostsServer: ServerRead<NoAsk, OwnPost[]> = {
    read: ownPostsRead,
    service: async () => {
        const base = await orgBase();
        return base ? getJson<OwnPost[]>(`${base}/share-posts`) : null;
    },
};

/**
 * What's worth posting on the free Share: the rows to pick from, read in
 * the browser. Null (a 404) without a live site to share from; the page
 * says so before it ever asks.
 */
export const socialPicksServer: ServerRead<NoAsk, SocialPicks> = {
    read: socialPicksRead,
    service: async () => {
        const [organization, web, sites] = await Promise.all([
            activeOrganizationOnce(),
            readWebAddressLinks(),
            listSites(),
        ]);
        const site = web && pickShareSite(sites, web.address);
        if (!organization || !web || !site) return null;
        const read = await readPicks(organization, web, site.id);
        return { rows: pickRows(read.pick), failed: read.failed };
    },
};
