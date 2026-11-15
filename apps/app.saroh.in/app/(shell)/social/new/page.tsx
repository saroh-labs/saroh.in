import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { CreatePost } from "@/components/social/create-post/create-post";
import { requireCan } from "@/lib/access/require-can";
import { requireSession } from "@/lib/session";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";
import { fixedChoices, pageChoices } from "@/lib/social/links";
import { pickRows } from "@/lib/social/pick";
import { readCreatePost } from "@/lib/social/read";
import { POST_WORDS } from "@/lib/social/words";

/**
 * Grow › Social › New post (#1378, plan 2026-11-12-003 U7): Create post.
 * Seen with `social:read`; an own post needs `social:post` too. Everything
 * is drawn from the live site, so without one the page says so, once.
 * Not there at all while Share is switched off (DEC-217).
 */
export const metadata = { title: "New post" };

export default async function NewPostPage() {
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
    return (
        <PageContainer width="full">
            <CreatePost
                rows={pickRows(read.pick)}
                setup={read.setup}
                origin={read.origin}
                fixedLinks={fixedChoices(read.links)}
                pageLinks={pageChoices(read.links)}
                canPost={may("social:post")}
                business={organization?.name ?? ""}
                failed={read.failed}
            />
        </PageContainer>
    );
}
