import type { EmptyStateProps } from "@saroh/ui/data-state";
import { EmptyState } from "@saroh/ui/data-state";

/**
 * Nothing in a console panel or tab: the one empty card
 * (`frontend-error-feedback.md` → One empty card) at `panel` size.
 *
 * - First run: "No {things} yet", one sentence, and the action only for
 *   someone who may take it.
 * - No results (`kind="no-results"`, with `things`): names what narrowed
 *   the list and offers "Clear search" or "Clear filters".
 */
export function EmptyPanel(props: EmptyStateProps) {
    return <EmptyState size="panel" {...props} />;
}
