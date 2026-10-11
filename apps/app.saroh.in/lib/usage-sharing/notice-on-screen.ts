/**
 * Whether the one-time recording notice is on screen in this tab (DEC-125,
 * 10 Oct). The recorder waits for it: nobody is recorded before they have
 * been told. `UsageNotice` says so once it has drawn; `WorkspaceTracking`
 * listens. In memory only: a reload asks again, and the server's answer
 * (`noticeSeenAt`) is what lasts.
 */
let onScreen = false;
const listeners = new Set<() => void>();

/** The notice has drawn. Stays true for the page: a notice read is read. */
export function markUsageNoticeOnScreen(): void {
    if (onScreen) return;
    onScreen = true;
    listeners.forEach((listener) => listener());
}

/** For `useSyncExternalStore`. */
export function subscribeUsageNotice(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

export function usageNoticeOnScreen(): boolean {
    return onScreen;
}

/** Tests only: a new page. */
export function resetUsageNoticeOnScreen(): void {
    onScreen = false;
}
