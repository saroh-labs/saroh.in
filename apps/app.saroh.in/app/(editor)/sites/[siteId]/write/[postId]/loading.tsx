import { PageLoading } from "@/components/shared/page/page-loading";

/**
 * `blogdesk/WXWStates` "Loading": only the writing surface greys. The bar,
 * rail, list and right column are `write/layout.tsx`'s and stay; their post
 * parts grey themselves until the post is here.
 */
export default function Loading() {
    return (
        <PageLoading
            shape="writing"
            width="full"
            bare
            bodyClassName="min-h-0"
            label="Opening the post"
        />
    );
}
