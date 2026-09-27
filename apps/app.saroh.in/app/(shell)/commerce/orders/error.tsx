"use client";

import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

import { OrdersFailed } from "@/components/commerce/orders/orders-states";
import { PageContainer } from "@/components/shared/page-container";
import { SectionError } from "@/components/shared/section-error";
import { isDenial } from "@/lib/api/errors";

/**
 * The Orders list couldn't be read (B7): the design's "Couldn't load
 * orders", under the page's heading, with Try again — never an empty list,
 * which would read as a business with no orders. A denial whose status
 * survived the throw is a denial, not a failure (SectionError).
 *
 * Try again is `retry`, which asks the server for the list again; `reset`
 * alone would redraw the same failed read.
 */
export default function Error({
    error,
    reset,
    retry,
}: {
    error: Error & { digest?: string };
    reset: () => void;
    retry: () => void;
}) {
    const denied = isDenial(error);

    useEffect(() => {
        if (!denied) {
            reportError(error, {
                boundary: "app/commerce/orders",
                digest: error.digest,
            });
        }
    }, [denied, error]);

    if (denied) return <SectionError error={error} reset={reset} />;

    return (
        <PageContainer width="full">
            <OrdersFailed reference={error.digest} onRetry={retry} />
        </PageContainer>
    );
}
