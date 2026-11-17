/**
 * Ask AI's panel opens from anywhere (the top bar's button, ⌘J) by an
 * app-wide event the host in the shell listens for, as the command menu's
 * does. The host says back whether it is open, so the button can show it.
 */
export const OPEN_ASK_AI = "saroh:open-ask-ai";
export const ASK_AI_SHOWN = "saroh:ask-ai-shown";

/**
 * On the full page (`/ask`) the conversation is already open: the button
 * and ⌘J put the cursor in its box, not a panel over it.
 */
export function onAskPage(): boolean {
    if (window.location.pathname !== "/ask") return false;
    document
        .querySelector<HTMLTextAreaElement>("#ask-ai-page textarea")
        ?.focus();
    return true;
}

export function openAskAi() {
    if (onAskPage()) return;
    window.dispatchEvent(new Event(OPEN_ASK_AI));
}

export function sayAskAiShown(open: boolean) {
    window.dispatchEvent(new CustomEvent(ASK_AI_SHOWN, { detail: open }));
}

const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab from the last control goes to the first, Shift+Tab the other way. */
export function keepTabInside(
    e: { shiftKey: boolean; preventDefault: () => void },
    root: HTMLElement,
) {
    const all = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => !el.closest("[hidden]"));
    const first = all.at(0);
    const last = all.at(-1);
    if (!first || !last) return;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === root)) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
    }
}
