/** Where the header's button goes once a tool has something to carry. */
let href: string | null = null;
const listeners = new Set<() => void>();

export const headerStart = () => href;

export function setHeaderStart(next: string | null) {
    href = next;
    listeners.forEach((l) => l());
}

export function onHeaderStart(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
