import { LiveReadCache } from "../../common/live-read-cache";

/**
 * Each business's module list, per who asks, for a minute: the shell, a
 * section's guard and each read's gate ask it on every page (~4 times),
 * and it changes only with a write. Every write through the API forgets
 * its business's lists (`modules-cache.middleware.ts`); the writers that
 * don't come through a request (the renewal job, an override lapsing, a
 * customer's first visit or sale) wait out the minute.
 * shortcut: per process; with `API_REPLICAS` > 1 another replica keeps
 * its own list for up to the minute. Move to Redis when it runs more.
 */
export const MODULE_LISTS_TTL_MS = 60_000;
// `unknown`: the service's `ModuleView[]`, left unnamed here so this file
// doesn't import the service (the middleware and job worker need `forget`).
export const moduleLists = new LiveReadCache<unknown>(
    MODULE_LISTS_TTL_MS,
    5_000,
);

/** Forget one business's module lists, or every business's. */
export function forgetModuleLists(organizationId?: string): void {
    if (organizationId) moduleLists.forget(`${organizationId}|`);
    else moduleLists.clear();
}
