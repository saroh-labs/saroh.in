"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { PageHeader } from "@saroh/ui/page-header";
import { Plus, RadioTower } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type {
    PageChoice,
    Read,
    SocialAccess,
    SocialChannel,
    SocialParams,
    SocialPost,
} from "@/lib/social/saroh-social-types";
import { connectedLine } from "@/lib/social/saroh-social-view";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";

import { ChannelsView } from "./channels/channels-view";
import { UsageMeter } from "./meter";
import { PostSheet } from "./post-sheet";
import { PostsView } from "./posts-view";

/**
 * Social with Saroh Social on (board BSocialHomeSocialDesk; research S2,
 * S3, S5): the next seven days and Posted and drafts, or the Channels,
 * with a post's sheet over either. The address holds where the person is
 * (`?tab=channels`, `?post=<id>`), so Home's Needs you rows open here.
 */
export function SarohSocialPage({
    access,
    channels,
    posts,
    opened,
    pages,
    params,
}: {
    access: SocialAccess;
    channels: Read<SocialChannel[]>;
    posts: Read<SocialPost[]>;
    /** The post `?post=` names, read on its own when it isn't in the list. */
    opened: SocialPost | null;
    /** A Facebook sign-in's Pages, when it came back to pick one. */
    pages: Read<PageChoice[]> | null;
    params: SocialParams;
}) {
    const narrow = useNarrow();
    const router = useRouter();
    const pathname = usePathname();
    const channelRows = channels.ok ? channels.data : [];
    const postRows = posts.ok ? posts.data : [];
    const onChannels = params.tab === "channels";
    const post =
        (params.post && postRows.find((p) => p.id === params.post)) ?? opened;
    const go = (q: Record<string, string | null>) => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(q)) if (v) next.set(k, v);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    const canPost = access.canPost;
    const newPost = canPost ? (
        <Button asChild size={narrow ? "default" : "lg"}>
            <IntentLink href="/social/new" data-new-post="">
                <Plus aria-hidden className="size-4" />
                {SOCIAL_WORDS.newPost}
            </IntentLink>
        </Button>
    ) : null;

    return (
        <div data-saroh-social="" className="grid gap-6">
            <PageHeader
                holdsData={onChannels ? false : "description"}
                // Compact (actions beside the title) only with one button:
                // the posts tab's meter and two buttons, held to their own
                // width there, ran the page ~600px wide on a phone and it
                // zoomed out (CI, 18 Nov). Below the title they wrap.
                compactOnPhone={onChannels}
                breadcrumb={
                    onChannels
                        ? [
                              "Grow",
                              <IntentLink key="social" href="/social">
                                  {SOCIAL_WORDS.social}
                              </IntentLink>,
                          ]
                        : ["Grow", SOCIAL_WORDS.social]
                }
                title={onChannels ? SOCIAL_WORDS.channels : SOCIAL_WORDS.social}
                description={
                    onChannels
                        ? SOCIAL_WORDS.channelsWhat
                        : channels.ok
                          ? connectedLine(channelRows)
                          : undefined
                }
                meta={onChannels ? undefined : <UsageMeter access={access} />}
                actions={
                    onChannels ? (
                        newPost
                    ) : (
                        <>
                            <Button
                                asChild
                                variant="outline"
                                size={narrow ? "default" : "lg"}
                                className="bg-card"
                            >
                                <IntentLink
                                    href="/social?tab=channels"
                                    data-channels-link=""
                                >
                                    <RadioTower
                                        aria-hidden
                                        className="size-4"
                                    />
                                    {SOCIAL_WORDS.channels}
                                </IntentLink>
                            </Button>
                            {newPost}
                        </>
                    )
                }
            />
            {onChannels ? (
                <ChannelsView
                    channels={channels}
                    canPost={canPost}
                    params={params}
                    pages={pages}
                />
            ) : (
                <PostsView
                    access={access}
                    channels={channelRows}
                    channelsRead={channels.ok}
                    posts={posts}
                    canPost={canPost}
                    narrow={narrow}
                />
            )}
            {post ? (
                <PostSheet
                    key={post.id}
                    post={post}
                    access={access}
                    channels={channelRows}
                    canPost={canPost}
                    narrow={narrow}
                    onClose={() => go({ tab: onChannels ? "channels" : null })}
                />
            ) : null}
        </div>
    );
}
