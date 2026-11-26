"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { useNarrow } from "@saroh/ui/lib/use-narrow";
import { PageHeader } from "@saroh/ui/page-header";
import { Plus, RadioTower } from "lucide-react";

import {
    useScreenGo,
    useScreenLink,
} from "@/components/shared/page/screen-pending";

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

import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";

import { ChannelsView } from "./channels/channels-view";
import { UsageMeter } from "./meter";
import { PostSheet } from "./post-sheet";
import { PostsView } from "./posts-view";

/**
 * Social with Saroh Social on (board BSocialHomeSocialDesk; research S2,
 * S3, S5): the next seven days and Posted and drafts, or the Channels,
 * with a post's sheet over either. The address holds where the person is
 * (`?tab=channels`, `?post=<id>`), so Home's Needs you rows open here.
 * Drawn at once from the page's gate (`access`): until Social's read
 * lands (`channels` and `posts` null) the header stands and the list is
 * a skeleton in its place.
 */
export function SarohSocialPage({
    access,
    channels,
    posts,
    opened,
    pages,
    params,
    reload,
}: {
    access: SocialAccess;
    /** Null while Social's read is on its way. */
    channels: Read<SocialChannel[]> | null;
    posts: Read<SocialPost[]> | null;
    /** The post `?post=` names, read on its own when it isn't in the list. */
    opened: SocialPost | null;
    /** A Facebook sign-in's Pages, when it came back to pick one. */
    pages: Read<PageChoice[]> | null;
    params: SocialParams;
    /** Read Social again, after a failed read. */
    reload: () => void;
}) {
    const narrow = useNarrow();
    const screenGo = useScreenGo();
    const screenLink = useScreenLink();
    const go = (href: string) => screenGo(href, "replace");
    const channelRows = channels?.ok ? channels.data : [];
    const postRows = posts?.ok ? posts.data : [];
    const onChannels = params.tab === "channels";
    const post =
        (params.post && postRows.find((p) => p.id === params.post)) ?? opened;

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
                              <IntentLink
                                  key="social"
                                  href="/social"
                                  onNavigate={screenLink("/social")}
                              >
                                  {SOCIAL_WORDS.social}
                              </IntentLink>,
                          ]
                        : [SOCIAL_WORDS.social]
                }
                title={onChannels ? SOCIAL_WORDS.channels : SOCIAL_WORDS.social}
                description={
                    onChannels ? (
                        SOCIAL_WORDS.channelsWhat
                    ) : !channels ? (
                        <FigureLoading className="w-48" />
                    ) : channels.ok ? (
                        connectedLine(channelRows)
                    ) : undefined
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
                                    onNavigate={screenLink(
                                        "/social?tab=channels",
                                    )}
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
            {!channels || !posts ? (
                <PageLoading
                    bare
                    shape="rows"
                    width="full"
                    label={SOCIAL_WORDS.loading}
                />
            ) : onChannels ? (
                <ChannelsView
                    channels={channels}
                    canPost={canPost}
                    params={params}
                    pages={pages}
                    go={go}
                    onRetry={reload}
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
                    onClose={() =>
                        go(onChannels ? "/social?tab=channels" : "/social")
                    }
                />
            ) : null}
        </div>
    );
}
