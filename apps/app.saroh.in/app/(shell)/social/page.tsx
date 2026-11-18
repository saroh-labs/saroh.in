import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { SocialHome } from "@/components/social/home/social-home";
import { SocialLocked } from "@/components/social/saroh/social-locked";
import { SarohSocialPage } from "@/components/social/saroh/social-page";
import { requireCan } from "@/lib/access/require-can";
import { requireSession } from "@/lib/session";
import { socialPrice } from "@/lib/share-item/read";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";
import { listOwnPosts } from "@/lib/social/own-posts";
import { pickRows } from "@/lib/social/pick";
import { readCreatePost } from "@/lib/social/read";
import {
    getSocialPost,
    listChannels,
    listSocialPosts,
    readPageChoices,
    readSocialAccess,
} from "@/lib/social/saroh-social";
import type { SocialParams } from "@/lib/social/saroh-social-types";
import { SOCIAL_WORDS } from "@/lib/social/saroh-social-words";
import { POST_WORDS } from "@/lib/social/words";

/**
 * Grow › Social. Seen with `social:read`; not there at all while Share is
 * switched off (DEC-217).
 *
 * With Saroh Social on for the business (plan saroh-social U9 to U13):
 * the next seven days and Posted and drafts, and `?tab=channels` for the
 * channels (board BSocialHomeSocialDesk). `?post=<id>` opens a post's
 * sheet, as Home's Needs you links.
 *
 * Otherwise what is worth posting today and Your posts (boards
 * BSocialHome*, BSocialEmpty*), the free Share, with Saroh Social's lock
 * where it would be; `?tab=channels` shows what Saroh Social is (S1).
 */
export const metadata = { title: "Social" };

const one = (v: string | string[] | undefined) =>
    typeof v === "string" && v !== "" ? v : null;

export default async function SocialPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    if (!sharePostsOn()) notFound();
    await requireSession();
    const { organization, may, denied } = await requireCan("social:read", {
        thing: "Social",
    });
    if (denied) return denied;
    const q = await searchParams;
    const params: SocialParams = {
        tab: one(q.tab) === "channels" ? "channels" : "posts",
        channel: one(q.channel),
        result: one(q.result),
        choice: one(q.choice),
        post: one(q.post),
    };
    const social = await readSocialAccess();

    if (social?.state === "on") {
        const [channels, posts, opened, pages] = await Promise.all([
            listChannels(),
            listSocialPosts(),
            params.post ? getSocialPost(params.post) : null,
            params.result === "choose" && params.choice
                ? readPageChoices(params.choice)
                : null,
        ]);
        return (
            <PageContainer width="full">
                <SarohSocialPage
                    access={social}
                    channels={channels}
                    posts={posts}
                    opened={opened?.ok ? opened.data : null}
                    pages={pages}
                    params={params}
                />
            </PageContainer>
        );
    }

    if (params.tab === "channels" && social?.state !== "unavailable") {
        // Saroh Social isn't open here, or its plan couldn't be checked (S1).
        return (
            <PageContainer>
                <PageHeader
                    className="mb-5"
                    holdsData={false}
                    compactOnPhone
                    breadcrumb={[
                        "Grow",
                        <Link key="social" href="/social">
                            {SOCIAL_WORDS.social}
                        </Link>,
                    ]}
                    title={SOCIAL_WORDS.channels}
                />
                <SocialLocked
                    access={social}
                    price={
                        social?.plan?.id === "grow" ? await socialPrice() : null
                    }
                />
            </PageContainer>
        );
    }

    const read = organization ? await readCreatePost(organization) : null;
    if (!read) {
        return (
            <PageContainer>
                <EmptyState
                    icon={<Globe />}
                    title={POST_WORDS.notLive}
                    action={
                        <Button asChild>
                            <Link href="/sites">{POST_WORDS.publishSite}</Link>
                        </Button>
                    }
                />
            </PageContainer>
        );
    }
    // Your posts can't be read: say so once, beside what could be.
    const ownPosts = await listOwnPosts().catch(() => null);
    return (
        <PageContainer width="full">
            <SocialHome
                rows={pickRows(read.pick)}
                posts={ownPosts ?? []}
                setup={read.setup}
                canPost={may("social:post")}
                failed={ownPosts ? read.failed : [...read.failed, "your posts"]}
            />
        </PageContainer>
    );
}
