"use client";

import { reportError } from "@saroh/ui/lib/report-error";
import { useEffect } from "react";

/** What Next hands an `error.tsx`. */
export interface BoundaryErrorProps {
    error: Error & { digest?: string };
    retry: () => void;
}

/** Reports a boundary's error once, tagged with where it was caught. */
export function useReportedError(
    error: BoundaryErrorProps["error"],
    boundary: string,
) {
    useEffect(() => {
        reportError(error, { boundary, digest: error.digest });
    }, [error, boundary]);
}
