"use client";

import { brandToastOptions } from "@saroh/ui/sonner";
import { Toaster } from "sonner";

/*
 * Toasts rise from the bottom, and below 760px the tab bar lives there: the
 * offsets add its height (`--tab-bar-inset`, 0 where there is no bar) so an
 * Undo is never drawn underneath it.
 */
const offset = { bottom: "calc(var(--tab-bar-inset) + 24px)" };
const mobileOffset = { bottom: "calc(var(--tab-bar-inset) + 16px)" };

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Toaster
                className="dark:hidden"
                position="bottom-center"
                offset={offset}
                mobileOffset={mobileOffset}
                toastOptions={brandToastOptions}
            />
            <Toaster
                theme="dark"
                className="hidden dark:block"
                position="bottom-center"
                offset={offset}
                mobileOffset={mobileOffset}
                toastOptions={brandToastOptions}
            />
            {children}
        </>
    );
}
