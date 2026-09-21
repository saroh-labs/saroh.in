"use client";

import { SectionError } from "@/components/shared/section-error";

/**
 * One tab failing costs that tab. The layout's header and tabs stay, so the
 * merchant can still reach the others — and the site itself is untouched.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <SectionError
            error={error}
            reset={reset}
            title="This tab couldn't be loaded"
            description="Nothing has changed and nothing is lost — your published site is unaffected."
            backHref="/sites"
            backLabel="Back to Website"
        />
    );
}
