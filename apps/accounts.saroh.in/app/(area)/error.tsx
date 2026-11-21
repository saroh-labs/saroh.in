"use client";

import { FailedState } from "@saroh/ui/data-state";

import {
    type BoundaryErrorProps,
    useReportedError,
} from "@/lib/boundary-error";

/**
 * A page of the account area that failed, inside the frame: the bar and the
 * menu stay, so the person can try again or go to another page, instead of
 * the whole screen turning into the root error page (21 Nov).
 */
export default function Error({ error, retry }: BoundaryErrorProps) {
    useReportedError(error, "accounts/area");
    return (
        <div className="max-w-[760px]">
            <FailedState size="page" onRetry={retry} reference={error.digest} />
        </div>
    );
}
