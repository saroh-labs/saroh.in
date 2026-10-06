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
 */

export const FLASH_MS = 2600;

type Flash = (message: string) => void;

const FlashContext = createContext<Flash | null>(null);

export function useFlash(): Flash {
    const flash = useContext(FlashContext);
    if (!flash) throw new Error("useFlash is used outside PlansToast");
    return flash;
}

export function PlansToast({ children }: { children: ReactNode }) {
    const [message, setMessage] = useState("");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flash = useCallback<Flash>((next) => {
        if (timer.current) clearTimeout(timer.current);
        setMessage(next);
        timer.current = setTimeout(() => setMessage(""), FLASH_MS);
    }, []);

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
                    <p className="rounded-[10px] bg-foreground px-4 py-[11px] text-[13px] font-semibold text-background">
                        {message}
                    </p>
                )}
            </div>
        </FlashContext.Provider>
    );
}
