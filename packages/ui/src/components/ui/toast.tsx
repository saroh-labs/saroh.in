import { toast } from "sonner";

/**
 * The one entry point for transient feedback.
 *
 * Call sites had been reaching for `sonner`'s `toast` directly in 45 files,
 * which made the toast library an API surface of the product rather than an
 * implementation detail: swapping it, theming it, routing errors to an error
 * tracker, or capping duplicate messages all meant touching every one of them.
 * Four functions with a fixed `(message, description?)` shape put a seam there
 * instead — every call site went through it unchanged, because 133 of the 138
 * already used exactly that shape.
 *
 * `description` is a second line of *product* copy. It is not a place to put
 * `error.message`, an api `detail`, or a response body: diagnostic text is for
 * the console and the error tracker, and a user shown a stack fragment learns
 * nothing they can act on. Map failures to your own strings.
 */
export function showSuccess(message: string, description?: string) {
    toast.success(message, { description });
}

/**
 * Errors persist until dismissed (brand file §14): a message you missed is
 * worse than none.
 */
export function showError(message: string, description?: string) {
    toast.error(message, {
        description,
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
    });
}

/**
 * Something reversible just happened, with the way back beside it. Undo is the
 * default for reversible actions; only the irreversible get a confirm. Eight
 * seconds rather than five, because it carries an action.
 *
 * `duration` is for a screen whose Undo window is a rule of its own — Order
 * Detail holds a kitchen step or a refund for ten seconds (ADR-008), and the
 * toast offering its Undo must last exactly that long, not the default.
 */
export function showUndo(
    message: string,
    onUndo: () => void,
    options: { duration?: number; description?: string } = {},
) {
    toast(message, {
        description: options.description,
        duration: options.duration ?? 8000,
        action: { label: "Undo", onClick: onUndo },
    });
}

/**
 * Clear every toast on screen. For a screen that starts its own Undo — Order
 * Detail's ten-second hold — so an older toast's Undo is not left beside it:
 * two Undos at once, for two different things, is how the wrong one is hit.
 */
export function dismissToasts() {
    toast.dismiss();
}

/** Something completed, but not the way the user asked for. */
export function showWarning(message: string, description?: string) {
    toast.warning(message, { description });
}

/** Neutral — neither a success nor a failure, just news. */
export function showInfo(message: string, description?: string) {
    toast.message(message, { description });
}
