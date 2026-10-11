import { PageLoading } from "@/components/shared/page-loading";

/**
 * Segment loading state. Without a `loading.tsx` this route has no Suspense
 * boundary, so the App Router holds the PREVIOUS page on screen until the
 * server render resolves — the click registers and nothing moves. The editor
 * owns its whole viewport, so its loader takes the whole width too.
 */
export default function Loading() {
    return (
        <PageLoading shape="editor" width="full" label="Loading the editor" />
    );
}
