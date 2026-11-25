import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe } from "lucide-react";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { SocialLocked } from "@/components/social/saroh/social-locked";
import {
    SarohSocialContainer,
    SocialHomeContainer,
} from "@/components/social/social-container";
import { requireCan } from "@/lib/access/require-can";
import { requireSession } from "@/lib/session";
import { readShareSetup, socialPrice } from "@/lib/share-item/read";
import { sharePostsOn } from "@/lib/share-item/share-posts-switch";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { socialParams } from "@/lib/social/queries";
import { readPageChoices, readSocialAccess } from "@/lib/social/saroh-social";
import { PICKER_KINDS } from "@/lib/social/saroh-social-types";
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
 *
 * On React Query (DEC-259), loaded in the browser: the page awaits only
 * its gates (Share on, `social:read`, whether Saroh Social is open, a live
 * site to share from); the posts, the channels, what's worth posting and
 * Your posts are the containers' queries, drawn into the real frame. The
 * Pages to pick after Meta stay this page's one-off read, never cached.
 */
export const metadata = { title: "Social" };

export default async function SocialPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    if (!sharePostsOn()) notFound();
    await requireSession();
    const { may, denied } = await requireCan("social:read", {
        thing: "Social",
    });
    if (denied) return denied;
    const params = socialParams(await searchParams);
    const social = await readSocialAccess();

    if (social?.state === "on") {
        const picking = PICKER_KINDS.find(
            (k) => k.toLowerCase() === params.channel,
        );
        const pages =
            params.result === "choose" && params.choice && picking
                ? await readPageChoices(picking, params.choice)
                : null;
        return (
            <PageContainer width="full">
                <SarohSocialContainer access={social} pages={pages} />
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
                        <IntentLink key="social" href="/social">
                            {SOCIAL_WORDS.social}
                        </IntentLink>,
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

    // A live site to share from: the gate, and the cards' look.
    const setup = await readShareSetup(await readWebAddressLinks());
    if (!setup) {
        return (
            <PageContainer>
                <EmptyState
                    icon={<Globe />}
                    title={POST_WORDS.notLive}
                    action={
                        <Button asChild>
                            <IntentLink href="/sites">
                                {POST_WORDS.publishSite}
                            </IntentLink>
                        </Button>
                    }
                />
            </PageContainer>
        );
    }
    return (
        <PageContainer width="full">
            <SocialHomeContainer setup={setup} canPost={may("social:post")} />
        </PageContainer>
    );
}
