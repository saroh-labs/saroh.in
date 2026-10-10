import { useCallback, useEffect, useRef } from "react";

/**
 * What a form holds right now, read from the page: every box, switch,
 * tick, choice, chip and rich text box inside it, in order, with what each
 * picker's button shows (a date, a time, a chosen option) and each picture
 * drawn (an uploaded logo). Two readings differ when something a person set in
 * the form differs, including a row added or taken away.
 */
export function readDraft(root: HTMLElement): string {
    const parts: string[] = [];
    const fields = root.querySelectorAll<HTMLElement>(
        "input, select, textarea, img, [contenteditable], [aria-pressed], [aria-checked], [aria-selected], [aria-haspopup], [role=combobox]",
    );
    for (const el of Array.from(fields)) {
        if (el instanceof HTMLImageElement) {
            parts.push(`img=${el.getAttribute("src") ?? ""}`);
        } else if (el.hasAttribute("contenteditable")) {
            // A rich text box (the footer's editor) holds its words itself.
            parts.push(`#${el.innerHTML}`);
        } else if (
            el.hasAttribute("aria-haspopup") ||
            el.getAttribute("role") === "combobox"
        ) {
            // A picker's button says what is picked.
            parts.push(
                el instanceof HTMLInputElement
                    ? `${el.name}=${el.value}`
                    : `^${el.textContent}`,
            );
        } else if (el instanceof HTMLInputElement) {
            parts.push(
                el.type === "checkbox" || el.type === "radio"
                    ? `${el.name}:${el.checked ? 1 : 0}`
                    : `${el.name}=${el.value}`,
            );
        } else if (
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement
        ) {
            parts.push(`${el.name}=${el.value}`);
        } else {
            parts.push(
                `~${el.getAttribute("aria-pressed") ?? ""}${el.getAttribute("aria-checked") ?? ""}${el.getAttribute("aria-selected") ?? ""}`,
            );
        }
    }
    return parts.join("\u0001");
}

/**
 * Whether a sheet's or dialog's draft differs from what it opened with,
 * so a stray press outside can be ignored once there is work to lose
 * (and only then). One rule for every frame, read from the form itself:
 * no sheet has to say what counts as a change.
 *
 * Put `attach` (as its ref) and `draftWatch(touch)` on the element that
 * wraps the fields. The reading
 * taken as "what it opened with" follows the form until the person first
 * presses or types in it, so fields that arrive a moment after opening
 * (a read, a default) are part of the start and not a change.
 * `changed()` is asked at the moment of the outside press.
 */
export function useDraftChanged() {
    const node = useRef<HTMLElement | null>(null);
    const touched = useRef(false);
    const first = useRef<string | null>(null);

    // Until the first press or key, the form as drawn is the start.
    useEffect(() => {
        if (!touched.current && node.current) {
            first.current = readDraft(node.current);
        }
    });

    // Each opening mounts the fields anew: a fresh start every time.
    const attach = useCallback((el: HTMLElement | null) => {
        node.current = el;
        touched.current = false;
        first.current = el ? readDraft(el) : null;
    }, []);

    const touch = useCallback(() => {
        touched.current = true;
    }, []);

    const changed = useCallback(
        () =>
            touched.current &&
            node.current !== null &&
            readDraft(node.current) !== first.current,
        [],
    );

    return { attach, touch, changed };
}

/**
 * The props that watch an element's fields: spread `draftWatch(touch)` on
 * the element `attach` is the ref of.
 */
export const draftWatch = (touch: () => void) => ({
    onPointerDownCapture: touch,
    onKeyDownCapture: touch,
    onInputCapture: touch,
    onChangeCapture: touch,
    onClickCapture: touch,
});
