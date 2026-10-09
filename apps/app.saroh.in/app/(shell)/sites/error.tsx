"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * Segment error boundary. Keeps the app chrome intact so a failure here costs
 * the merchant this panel, not their ability to navigate — see SectionError.
 *
 * The title is the design's "Website could not be loaded" (#370, #908). Only
 * the workspace's read failed: the public site is served from its last
 * publication, so the sentence can promise that much and no more. Try again
 * is `retry`, which reads the site again; `reset` alone would redraw the same
 * failed read.
 */
export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <SectionError
            error={error}
            reset={retry}
            title="Website could not be loaded"
            description="Saroh couldn't read it just now. Your published site is unaffected."
            backHref="/"
            backLabel="Back to Home"
        />
    );
}
