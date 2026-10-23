"use client";

import { SectionError } from "@/components/shared/states/section-error";

/**
 * Segment error boundary. Keeps the app chrome intact so a failure here costs
 * the merchant this panel, not their ability to navigate — see SectionError.
 *
 * Only the app's read failed (#370, #908): the public site is served from
 * its last publication, so the sentence can promise that much and no more.
 * Try again is `retry`, which reads the site again.
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
            retry={retry}
            heading="Website"
            things="your website"
            reassurance="Your published site is unaffected."
        />
    );
}
