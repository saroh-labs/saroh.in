import { PageLoading } from "@/components/shared/page-loading";

/**
 * App-root loading state. Rendered by Next for any segment that suspends and
 * lacks its own `loading.tsx`, so a slow route shows the one loading shell
 * instead of a blank or frozen page.
 */
export default function Loading() {
    return <PageLoading shape="list" width="default" label="Loading" />;
}
