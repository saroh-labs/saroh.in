/**
 * Load the page again, whole. For a page the browser brought back from its
 * back/forward cache: Next restores its own router state as the page is
 * shown, and a `router.refresh()` asked for then is dropped.
 */
export function reloadPage(): void {
    window.location.reload();
}
