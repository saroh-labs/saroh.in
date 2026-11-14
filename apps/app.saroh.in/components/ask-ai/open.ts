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
