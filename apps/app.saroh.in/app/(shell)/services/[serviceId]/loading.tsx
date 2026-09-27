import { ServiceEditorSkeleton } from "@/components/services/service-editor/editor-skeleton";

/**
 * Segment loading state. Without a `loading.tsx` this route has no Suspense
 * boundary, so the App Router holds the PREVIOUS page on screen until the
 * server render resolves — the click registers and nothing moves. The shape
 * is the Service Editor's, so nothing jumps when it lands.
 */
export default function Loading() {
    return <ServiceEditorSkeleton />;
}
