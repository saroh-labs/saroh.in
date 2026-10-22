import { showError, showSuccess } from "@saroh/ui/toast";

import type { HeldResult } from "./use-hold";

/**
 * `useHold` with no ten seconds, for a component test that is about what
 * a screen does once its hold ends: the held call runs at once, and says
 * what the real one says. The hold itself is `use-hold.test.tsx`'s.
 *
 *     vi.mock("@/components/shared/undo/use-hold", () =>
 *         import("@/components/shared/undo/hold-now.test-kit"),
 *     );
 */
export function useHold() {
    const hold = (
        _key: string,
        _message: string,
        commit: () => Promise<void> | void,
    ) => {
        void commit();
    };
    const send = (
        _key: string,
        options: {
            run: () => Promise<HeldResult>;
            sent: string | (() => string);
            sentDescription?: string;
            failed?: string;
            onSent?: () => void;
            onBack?: () => void;
        },
    ) => {
        void (async () => {
            const res = await options.run();
            if (!res.ok) {
                if (!res.said) {
                    showError(
                        options.failed ?? "That wasn't sent.",
                        res.error || undefined,
                    );
                }
                options.onBack?.();
                return;
            }
            showSuccess(
                typeof options.sent === "string"
                    ? options.sent
                    : options.sent(),
                options.sentDescription,
            );
            options.onSent?.();
        })();
    };
    return { hold, send, undo: () => undefined, pending: [] as string[] };
}
