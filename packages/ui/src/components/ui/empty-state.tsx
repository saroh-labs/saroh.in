/**
 * `EmptyState` moved into the named product-state set (#177).
 *
 * It is re-exported here because "empty" is no longer one thing: a screen can
 * have nothing on it because nothing has happened yet, because a capability is
 * off, because the caller lacks permission, or because a query failed — and
 * §30 requires those to be distinguishable. `EmptyState` now means only the
 * first of those. See `./data-state` for the rest.
 *
 * This file stays so the `@saroh/ui/empty-state` subpath keeps resolving for
 * the surfaces already importing it.
 */
export { EmptyState } from "./data-state";
export type { EmptyStateProps } from "./data-state";
