"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { ScreenPending } from "@/components/shared/page/screen-pending";
import type { ShareSetup } from "@/lib/share-item/share";
import { socialParams } from "@/lib/social/queries";
import type {
    PageChoice,
    Read,
    SocialAccess,
} from "@/lib/social/saroh-social-types";
import {
    useOpenedPost,
    useOwnPosts,
    useSocialPicks,
    useSocialScreen,
} from "@/lib/social/use-social";

import { SocialHome } from "./home/social-home";
import { SarohSocialPage } from "./saroh/social-page";

/**
 * Social with Saroh Social on, on React Query (DEC-259), read in the
 * browser: the frame (header, Channels, New post) is drawn at once from
 * the page's gate (`access`); the channels and the posts are one query,
 * a skeleton until it lands, and its fresher `access` (this month's count)
 * then takes over. The address (`?tab=`, `?post=`) changes in place; a post
 * `?post=` names that isn't in the list is read on its own. Social failing
 * to read is the page failing.
 */
export function SarohSocialContainer({
    access,
    pages,
}: {
    access: SocialAccess;
    /** A Facebook sign-in's Pages, read by the page when it came back to pick one. */
    pages: Read<PageChoice[]> | null;
}) {
    const search = useSearchParams();
    const params = useMemo(
        () => socialParams(Object.fromEntries(search.entries())),
        [search],
    );
    const screen = useSocialScreen();
    const posts = screen.data?.posts;
    const listed =
        params.post !== null &&
        posts?.ok === true &&
        posts.data.some((p) => p.id === params.post);
    const opened = useOpenedPost(
        params.post,
        screen.data !== undefined && !listed,
    );

    if (screen.isError && !screen.data) throw screen.error;

    return (
        <ScreenPending inPlace={{ pending: opened.isFetching }}>
            <SarohSocialPage
                access={screen.data?.access ?? access}
                channels={screen.data?.channels ?? null}
                posts={screen.data?.posts ?? null}
                opened={listed ? null : (opened.data ?? null)}
                pages={pages}
                params={params}
                reload={() => void screen.refetch()}
            />
        </ScreenPending>
    );
}

/**
 * The free Share (Social without Saroh Social), on React Query: the header
 * at once, then what is worth posting and Your posts, each its own query.
 * Either failing is said once, beside what could be read, never as none.
 */
export function SocialHomeContainer({
    setup,
    canPost,
}: {
    setup: ShareSetup;
    canPost: boolean;
}) {
    const picks = useSocialPicks();
    const own = useOwnPosts();
    const waiting =
        (!picks.data && !picks.isError) || (!own.data && !own.isError);
    const failed = [
        ...(picks.data?.failed ?? (picks.isError ? ["what to post"] : [])),
        ...(own.isError && !own.data ? ["your posts"] : []),
    ];
    return (
        <SocialHome
            rows={waiting ? null : (picks.data?.rows ?? [])}
            posts={waiting ? null : (own.data ?? [])}
            setup={setup}
            canPost={canPost}
            failed={failed}
        />
    );
}
