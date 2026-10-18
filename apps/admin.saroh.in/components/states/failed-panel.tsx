"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A console panel whose read failed: "Couldn't load {things}", "Nothing has
 * been changed." and Try again, inside the panel, so the rest of the screen
 * stands. Try again reads again: `onRetry` for a read the component made
 * itself, otherwise the route is refreshed.
 */
export function FailedPanel({
    things,
    reassurance,
    onRetry,
    reference,
}: {
    /** The thing's own plural word: "businesses". */
    things: string;
    /** One true sentence after "Nothing has been changed.". */
    reassurance?: string;
    onRetry?: () => void;
    /** The digest support can look the failure up by. */
    reference?: string | null;
}) {
    const router = useRouter();
    const [retrying, start] = useTransition();
    return (
        <FailedState
            size="panel"
            title={couldntLoad(things)}
            description={nothingChanged(reassurance)}
            onRetry={onRetry ?? (() => start(() => router.refresh()))}
            retrying={retrying}
            reference={reference}
        />
    );
}
