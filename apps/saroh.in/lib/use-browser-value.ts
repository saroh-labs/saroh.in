import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the value doesn't change while the page is open. */
const NO_CHANGES = () => () => undefined;

/**
 * A value read in the browser that stays put while the page is open: the
 * page's address, a browser's privacy setting (DEC-195, B7). The server (and
 * the first render) draws `onServer`, so the page stays static.
 */
export function useBrowserValue<T>(read: () => T, onServer: T): T {
    return useSyncExternalStore(NO_CHANGES, read, () => onServer);
}
