"use client";

import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

/**
 * The Plans & modules screen's one-line confirmation: an inverted pill at the
 * foot of the screen, as the design draws it ("Draft discarded", "Version 2
 * is live on the pricing page"). The console mounts no toaster of its own,
 * and this says only that something the operator just did worked; a failure
 * is said where it happened, never only here.
 *
 * It can carry one Undo (taking back a plan or module removed from the
 * draft), held longer so there's time to press it. Undo is never the only
 * way back: the removed part can always be added again.
 */

export const FLASH_MS = 2600;
export const UNDO_MS = 8000;

export interface FlashAction {
    label: string;
    onClick: () => void;
}

type Flash = (message: string, action?: FlashAction) => void;

const FlashContext = createContext<Flash | null>(null);

export function useFlash(): Flash {
    const flash = useContext(FlashContext);
    if (!flash) throw new Error("useFlash is used outside PlansToast");
    return flash;
}

export function PlansToast({ children }: { children: ReactNode }) {
    const [message, setMessage] = useState("");
    const [action, setAction] = useState<FlashAction | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        setMessage("");
        setAction(null);
    }, []);

    const flash = useCallback<Flash>(
        (next, act) => {
            if (timer.current) clearTimeout(timer.current);
            setMessage(next);
            setAction(act ?? null);
            timer.current = setTimeout(clear, act ? UNDO_MS : FLASH_MS);
        },
        [clear],
    );

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    return (
        <FlashContext.Provider value={flash}>
            {children}
            {/* Always mounted, so a screen reader hears each message. */}
            <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed inset-x-0 bottom-6 z-[95] flex justify-center px-4"
            >
                {message && (
                    <p className="pointer-events-auto flex items-center gap-3 rounded-[10px] bg-foreground px-4 py-[11px] text-[13px] font-semibold text-background">
                        {message}
                        {action && (
                            <button
                                type="button"
                                onClick={() => {
                                    action.onClick();
                                    clear();
                                }}
                                className="cursor-pointer rounded-[6px] underline decoration-2 underline-offset-2 hover:decoration-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:no-underline"
                            >
                                {action.label}
                            </button>
                        )}
                    </p>
                )}
            </div>
        </FlashContext.Provider>
    );
}
