"use client";

import { SectionError } from "@/components/shared/states/section-error";

/**
 * One tab of API and AI apps failing costs that tab: the layout's header
 * and tabs stay, so the others are a press away.
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
            heading="API and AI apps"
            things="this tab"
            reassurance="Your keys, connections and addresses are all still there."
            backHref="/settings"
            place="Settings"
        />
    );
}
