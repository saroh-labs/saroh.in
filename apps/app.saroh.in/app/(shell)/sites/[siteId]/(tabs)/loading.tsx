import { LoadingState } from "@saroh/ui/data-state";

/**
 * A tab's own loading state. The header and tabs above it belong to the
 * layout and stay on screen, so only the list waits — drawn in the list's
 * own shape so nothing jumps when it lands.
 */
export default function Loading() {
    return <LoadingState variant="list" rows={4} label="Loading this tab" />;
}
