/**
 * When a new record's address may change (UX-080).
 *
 * The first autosave of a new plan or pack creates it as a Draft, and the
 * address becomes its edit page (`/new` → `/<id>/edit`), so a reload or a
 * shared link lands on the record. Done at once, the address jumped while
 * the merchant was still typing its name. So it waits until they are not
 * typing: focus has left every text field.
 */

/** Input types that take no typing: a focus on one is not "typing". */
const NOT_TYPED = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
]);

/** Whether the focused element is one someone types into. */
export function isTypingIn(el: Element | null | undefined): boolean {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
        return !NOT_TYPED.has((el as HTMLInputElement).type);
    }
    return (el as HTMLElement).isContentEditable === true;
}
