import { PageHeader } from "@saroh/ui/page-header";

import { PageLoading } from "@/components/shared/page-loading";

/**
 * The page's own frame and title, with only the choices grey: the same
 * centred measure as `page.tsx`, so nothing moves when they land.
 */
export default function Loading() {
    return (
        <main className="mx-auto w-full max-w-2xl px-6 py-16">
            <PageHeader title="What do you need to do?" />
            <PageLoading
                bare
                shape="list"
                width="form"
                label="Loading what you can turn on"
            />
        </main>
    );
}
