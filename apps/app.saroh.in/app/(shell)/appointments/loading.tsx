import { ListSkeleton } from "@/components/shared/list-skeleton";

/**
 * Segment loading state. Without a `loading.tsx` this route has no Suspense
 * boundary, so the App Router holds the PREVIOUS page on screen until the
 * server render resolves — the click registers and nothing moves. Shape and
 * width match the page below so nothing jumps when the real content lands.
 */
export default function Loading() {
    return <ListSkeleton maxWidth="max-w-7xl" />;
}
