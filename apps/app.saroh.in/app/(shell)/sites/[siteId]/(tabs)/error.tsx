"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * One tab failing costs that tab. The layout's header and tabs stay, so the
 * merchant can still reach the others — and the site itself is untouched.
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
            things="this tab"
            reassurance="Your published site is unaffected."
            backHref="/sites"
            place="Website"
        />
    );
}
