/**
 * A way off the page made in code — `router.push` from Search settings or
 * the ⌘K menu — asks first, as a link click does, whether an open edit holds
 * the page (`components/organizations/use-leave-guard.tsx`). An event on the
 * window, so the menus need not know which screen is editing.
 */
const LEAVE_REQUEST = "saroh:leave-request";

/**
 * Ask to go to `href`. False when an open edit held it — the edit then asks
 * the person, and goes there itself if they discard it.
 */
export function mayNavigate(
    href: string,
    target: EventTarget = window,
): boolean {
    return target.dispatchEvent(
        new CustomEvent(LEAVE_REQUEST, { detail: href, cancelable: true }),
    );
}

/**
 * Hold navigations made in code while an edit is open: `hold` answers true
 * for one it stops. Returns the way to stop listening.
 */
export function onLeaveRequest(
    hold: (href: string) => boolean,
    target: EventTarget = window,
): () => void {
    const listener = (e: Event) => {
        if (hold((e as CustomEvent<string>).detail)) e.preventDefault();
    };
    target.addEventListener(LEAVE_REQUEST, listener);
    return () => target.removeEventListener(LEAVE_REQUEST, listener);
}
