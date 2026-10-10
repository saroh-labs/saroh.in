import { showError } from "@saroh/ui/toast";
import { unstable_rethrow } from "next/navigation";

import { UNREACHED } from "@/lib/api/unreached";

/**
 * Run a server action from a control that shows it is busy (10 Oct 2026).
 *
 * `setBusy(true); const res = await save(); setBusy(false);` leaves the
 * control on "Saving…" for good when the action throws, and it throws
 * whenever the browser can't reach this app: offline, a dropped
 * connection, a deploy mid-request. This is the one way to write it:
 *
 *     const res = await runAction(() => saveService(id, values), { setBusy });
 *     if (!res) return; // it never got there, and has been said
 *     if (!res.ok) …
 *
 * - `setBusy` is always cleared, in a `finally`.
 * - A thrown action is said once, in the one sentence for it
 *   (`UNREACHED`), and the call answers `undefined`. Pass `quiet` to say
 *   it yourself (`onUnreached` is called either way).
 * - One of Next's own interrupts (a redirect after the save, `notFound`)
 *   is passed on untouched.
 *
 * The API not answering is not this function's business: `mutate` already
 * returns that as a failure with the same sentence (`http.ts`).
 */
export async function runAction<T>(
    action: () => Promise<T>,
    options: {
        setBusy?: (busy: boolean) => void;
        /** Don't show the sentence: the caller puts it somewhere itself. */
        quiet?: boolean;
        /** Called with the sentence when the action threw. */
        onUnreached?: (sentence: string) => void;
    } = {},
): Promise<T | undefined> {
    options.setBusy?.(true);
    try {
        return await action();
    } catch (error) {
        unstable_rethrow(error);
        if (!options.quiet) showError(UNREACHED);
        options.onUnreached?.(UNREACHED);
        return undefined;
    } finally {
        options.setBusy?.(false);
    }
}
