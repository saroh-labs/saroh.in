/**
 * Filters kept in the page address, so a link keeps them and Back undoes
 * them: the Solutions hub's finder on saroh.in and saroh.tech (marketing)
 * and the /for/ hub's (search-pages) share this one copy.
 */
const CHANGED = "saroh:for-hub-filters";

/** For `useSyncExternalStore`: Back, Forward and our own writes. */
export function subscribeAddress(onChange: () => void): () => void {
    window.addEventListener("popstate", onChange);
    window.addEventListener(CHANGED, onChange);
    return () => {
        window.removeEventListener("popstate", onChange);
        window.removeEventListener(CHANGED, onChange);
    };
}

/** Writes the set values to the address (empty ones dropped) and tells subscribers. */
export function setAddressParams(
    values: Record<string, string | null | undefined>,
    how: "pushState" | "replaceState",
): void {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value) params.set(key, value);
    }
    const search = params.toString();
    window.history[how](
        null,
        "",
        search
            ? `${window.location.pathname}?${search}`
            : window.location.pathname,
    );
    window.dispatchEvent(new Event(CHANGED));
}
