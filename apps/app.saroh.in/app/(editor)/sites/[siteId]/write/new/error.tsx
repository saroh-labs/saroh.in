"use client";

import { useParams } from "next/navigation";

import { SectionError } from "@/components/shared/states/section-error";
import { PostFrameAway } from "@/components/sites/posts/editor/post-frame";

/**
 * `blogdesk/WXWStates` "Couldn't load": the post didn't open, nothing was
 * changed, and the way back is the kind's list. In the writing surface's
 * place: the frame stays, so the list still opens another post.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    const { siteId } = useParams<{ siteId: string }>();
    return (
        <>
            <PostFrameAway />
            <SectionError
                error={error}
                retry={retry}
                things="this post"
                reassurance="Your writing is safe."
                backHref={`/sites/${siteId}/writing`}
                place="Blog"
            />
        </>
    );
}
