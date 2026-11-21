"use client";

import { FailedState } from "@saroh/ui/data-state";
import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/**
 * A page of the account area that failed, inside the frame: the bar and the
 * menu stay, so the person can try again or go to another page, instead of
 * the whole screen turning into the root error page (21 Nov).
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        reportError(error, { boundary: "accounts/area", digest: error.digest });
    }, [error]);

    return (
        <div className="max-w-[760px]">
            <FailedState size="page" onRetry={retry} reference={error.digest} />
        </div>
    );
}
