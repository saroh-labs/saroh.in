import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Globe } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import type { Step } from "@/components/social/create-post/create-post";
import { CreatePost } from "@/components/social/create-post/create-post";
import { requireCan } from "@/lib/access/require-can";
import { requireSession } from "@/lib/session";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";
import { fixedChoices, pageChoices } from "@/lib/social/links";
import { getOwnPost, listOwnPosts } from "@/lib/social/own-posts";
import { pickRows } from "@/lib/social/pick";
import { readCreatePost } from "@/lib/social/read";
import { listChannels, readSocialAccess } from "@/lib/social/saroh-social";
import type { SocialCompose } from "@/lib/social/use-social-post";
import { POST_WORDS } from "@/lib/social/words";

/**
 * Grow › Social › New post (#1378, plan 2026-11-12-003 U7; boards BPick*,
 * BPost*, BOwn*): Create post. Seen with `social:read`; an own post needs
 * `social:post` too. Everything is drawn from the live site, so without
 * one the page says so, once. Not there at all while Share is switched
 * off (DEC-217). `?item=<pick key>` opens on a thing (or `?kind=&ref=`,
 * as an item's Share sheet names it), `?post=<id>` on a saved own post,
 * `?own=text|photo` on a new one.
 *
 * With Saroh Social on and `social:post` (plan saroh-social U10, board
 * BSocialDesk), the post goes to the business's channels, now or at a
 * time: `?at=<instant>` or `?day=<YYYY-MM-DD>` start it there.
 */
export const metadata = { title: "New post" };

const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;

export default async function NewPostPage({
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
    const params = await searchParams;
    const canPost = may("social:post");
    const postId = one(params.post);
    const [posts, saved, social] = await Promise.all([
        listOwnPosts().catch(() => []),
        postId && canPost ? getOwnPost(postId).catch(() => null) : null,
        canPost ? readSocialCompose(params) : null,
    ]);
    const rows = pickRows(read.pick);
    const kind = one(params.kind);
    const ref = one(params.ref);
    const item =
        one(params.item) ??
        (kind && ref
            ? rows.find((r) => r.item?.kind === kind && r.item.ref === ref)?.key
            : undefined);
    const own = one(params.own);
    const start: Step = saved
        ? { at: "own", photo: false, post: saved }
        : item
          ? { at: "item", key: item }
          : canPost && (own === "text" || own === "photo")
            ? { at: "own", photo: own === "photo", post: null }
            : { at: "pick" };
    return (
        <PageContainer width="full">
            <CreatePost
                rows={rows}
                setup={read.setup}
                origin={read.origin}
                fixedLinks={fixedChoices(read.links)}
                pageLinks={pageChoices(read.links)}
                canPost={canPost}
                business={organization?.name ?? ""}
                failed={read.failed}
                ownCount={posts.length}
                start={start}
                social={social}
            />
        </PageContainer>
    );
}

/** Saroh Social for the composer, when it is on here; null otherwise. */
async function readSocialCompose(
    params: Record<string, string | string[] | undefined>,
): Promise<SocialCompose | null> {
    const access = await readSocialAccess();
    if (access?.state !== "on" || !access.canPost) return null;
    const channels = await listChannels();
    const at = one(params.at);
    const day = one(params.day);
    return {
        access,
        channels: channels.ok ? channels.data : [],
        channelsFailed: !channels.ok,
        at: at && !Number.isNaN(Date.parse(at)) ? at : null,
        day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    };
}
