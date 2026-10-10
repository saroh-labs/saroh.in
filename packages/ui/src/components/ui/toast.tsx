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
export function showSuccess(
    message: string,
    description?: string,
    action?: ToastAction,
) {
    toast.success(message, {
        description,
        ...(action
            ? {
                  // Long enough to read the line and reach the button.
                  duration: UNDO_MS,
                  action: { label: action.label, onClick: action.onClick },
              }
            : {}),
    });
}

/**
 * One button on a success toast: the way to the thing just made ("Open
 * lead"), for a sheet or dialog that keeps the merchant where they were.
 * Never the only way there.
 */
export interface ToastAction {
    label: string;
    onClick: () => void;
}

/**
 * Errors persist until dismissed (brand file §14): a message you missed is
 * worse than none.
 */
export function showError(message: string, description?: string) {
    // A refusal is not a breakage: it is said calmly, never in red.
    if (refusals.some((is) => is(message))) {
        showRefusal(message, description);
        return;
    }
    const way =
        errorActions.get(message) ?? errorActions.get(description ?? "");
    toast.error(message, {
        description,
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        ...(way
            ? {
                  // One toast for it however many saves say it: the id
                  // makes a second one replace the first.
                  id: way.id,
                  action: {
                      label: way.label,
                      onClick: (event: { preventDefault(): void }) => {
                          // It stays: the way out may be needed twice.
                          event.preventDefault();
                          way.onClick();
                      },
                  },
              }
            : {}),
    });
}

interface ErrorAction {
    id: string;
    label: string;
    onClick: () => void;
}

const errorActions = new Map<string, ErrorAction>();

/**
 * Give one error sentence its way out, wherever it is shown from.
 *
 * Some failures have one thing to do about them, and the sentence is said
 * by hundreds of call sites that only know `showError(res.error)`: a save
 * sent after the session ended says "You've been signed out…" and needs a
 * "Sign in" button. Registering the sentence here puts the button on every
 * one of them, and keeps it to one toast on screen. An app registers on
 * mount and calls the returned function to take it back.
 */
export function setErrorAction(
    sentence: string,
    action: { label: string; onClick: () => void },
): () => void {
    errorActions.set(sentence, { id: `error-action:${sentence}`, ...action });
    return () => {
        errorActions.delete(sentence);
    };
}

/**
 * "You may not" is not "it broke". A refusal (by the person's role, most
 * often) is said in the neutral style, with no red and no alert glyph: red
 * tells someone to try again at a thing that will only be refused again.
 * It stays ten seconds, long enough to read who can change it, and can be
 * closed.
 */
export function showRefusal(message: string, description?: string) {
    toast.message(message, {
        description,
        duration: UNDO_MS,
        closeButton: true,
    });
}

type RefusalTest = (message: string) => boolean;
const refusals: RefusalTest[] = [];

/**
 * Teach `showError` which sentences are refusals, wherever they are shown
 * from.
 *
 * Hundreds of call sites only know `showError(res.error)`, and the sentence
 * is all that reaches them. An app registers how to tell its refusals (the
 * merchant app: `isRoleRefusal`) once, on mount, and every one of those
 * call sites then says a refusal through `showRefusal`. Call the returned
 * function to take it back.
 */
export function setRefusalTest(is: RefusalTest): () => void {
    refusals.push(is);
    return () => {
        const at = refusals.indexOf(is);
        if (at !== -1) refusals.splice(at, 1);
    };
}

/** How long anything can be undone: ten seconds, everywhere. */
export const UNDO_MS = 10_000;

/** What an Undo said: nothing or `true` when done, else refused. */
export type UndoResult = void | boolean | { ok: boolean; error?: string };

export const UNDONE = "Undone.";
export const NOT_UNDONE = "Couldn't undo. It stays as saved.";

/**
 * Something reversible just happened, with the way back beside it. Undo is the
 * default for reversible actions; only the irreversible get a confirm. Ten
 * seconds, everywhere: no screen has a window of its own.
 *
 * `undo` takes it back and says how that went (a promise, or a result);
 * this says the rest, in one wording: "Undone." when it worked, "Couldn't
 * undo. It stays as saved." when it was refused or threw (with the
 * refusal's own sentence under it). So no caller words an Undo's outcome,
 * and none fails silently.
 *
 * An `undo` that returns nothing at once has kept the outcome for itself:
 * a hold card that draws its own state on the page. Nothing is said for
 * it here. `quiet` says the same for one that returns a promise.
 *
 * Returns the toast's id, for `dismissToast` when the window closes early.
 */
export function showUndo(
    message: string,
    undo: () => UndoResult | Promise<UndoResult>,
    options: { duration?: number; description?: string; quiet?: boolean } = {},
): ToastId {
    return toast(message, {
        description: options.description,
        duration: options.duration ?? UNDO_MS,
        action: {
            label: "Undo",
            onClick: () => {
                void settleUndo(undo, options.quiet ?? false);
            },
        },
    });
}

/** Run an Undo and say how it went. Exported for a second Undo button. */
export async function settleUndo(
    undo: () => UndoResult | Promise<UndoResult>,
    quiet = false,
): Promise<boolean> {
    let result: UndoResult;
    try {
        const started = undo();
        // Nothing came back at once: the caller draws the outcome itself.
        if (started === undefined) return true;
        result = await started;
    } catch {
        result = false;
    }
    const ok =
        result === undefined ||
        result === true ||
        (typeof result === "object" && result.ok);
    if (quiet) return ok;
    if (ok) {
        showSuccess(UNDONE);
    } else {
        showError(
            NOT_UNDONE,
            typeof result === "object" ? result.error : undefined,
        );
    }
    return ok;
}

/**
 * Clear every toast on screen. For a screen that starts its own Undo — Order
 * Detail's ten-second hold — so an older toast's Undo is not left beside it:
 * two Undos at once, for two different things, is how the wrong one is hit.
 */
export function dismissToasts() {
    toast.dismiss();
}

/** Which toast, as `showUndo` returned it. */
export type ToastId = string | number;

/**
 * Clear one toast. For an Undo whose window closed before its toast did —
 * the thing it would undo has since changed, or the screen was left — so a
 * button that would do nothing is not left on screen. Unlike
 * `dismissToasts()`, an error toast beside it stays.
 */
export function dismissToast(id: ToastId) {
    toast.dismiss(id);
}

/** Something completed, but not the way the user asked for. */
export function showWarning(message: string, description?: string) {
    toast.warning(message, { description });
}

/** Neutral — neither a success nor a failure, just news. */
export function showInfo(message: string, description?: string) {
    toast.message(message, { description });
}
