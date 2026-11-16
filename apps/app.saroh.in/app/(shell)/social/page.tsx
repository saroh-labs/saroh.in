import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { SocialHome } from "@/components/social/home/social-home";
import { requireCan } from "@/lib/access/require-can";
import { requireSession } from "@/lib/session";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";
import { listOwnPosts } from "@/lib/social/own-posts";
import { pickRows } from "@/lib/social/pick";
import { readCreatePost } from "@/lib/social/read";
import { POST_WORDS } from "@/lib/social/words";

/**
 * Grow › Social (boards BSocialHome*, BSocialEmpty*): what is worth
 * posting today and Your posts, or on a first visit, posts already drawn
 * from the business. Seen with `social:read`. Not there at all while
 * Share is switched off (DEC-217). Saroh Social's own views (connected
 * channels, the next 7 days, posts in the Calendar) wait for it to exist.
 */
export const metadata = { title: "Social" };

export default async function SocialPage() {
    if (!sharePostsOn()) notFound();
    await requireSession();
    const { organization, may, denied } = await requireCan("social:read", {
        thing: "Social",
    });
    if (denied) return denied;
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
    const posts = await listOwnPosts().catch(() => null);
    return (
        <PageContainer width="full">
            <SocialHome
                rows={pickRows(read.pick)}
                posts={posts ?? []}
                setup={read.setup}
                canPost={may("social:post")}
                failed={posts ? read.failed : [...read.failed, "your posts"]}
            />
        </PageContainer>
    );
}
