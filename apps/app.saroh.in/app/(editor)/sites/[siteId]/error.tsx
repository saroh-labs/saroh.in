"use client";

import { SectionError } from "@/components/shared/states/section-error";

/**
 * The editor's own error boundary (#275).
 *
 * `app/(editor)` had none, so anything thrown here — most often a 403 from the
 * draft load, which requires `section:write` — fell through to the root
 * boundary and rendered as a generic failure. §30: a denial is explained, not
 * presented as breakage.
 *
 * The reassurance matters more here than anywhere else in the app: the editor
 * failing to open says nothing about the site the public is being served, and
 * a merchant whose shop front is live will assume the worst.
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
            things="the editor"
            reassurance="Your published site is unaffected."
            backHref="/sites"
            place="Website"
        />
    );
}
