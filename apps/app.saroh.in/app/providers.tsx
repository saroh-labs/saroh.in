"use client";

import { brandToastOptions } from "@saroh/ui/sonner";
import { Toaster } from "sonner";

/*
 * Toasts rise from the bottom, and below 760px the tab bar lives there: the
 * offsets add its height (`--tab-bar-inset`, 0 where there is no bar) so an
 * Undo is never drawn underneath it.
 *
 * One Toaster for both modes. The toasts are unstyled and take their colours
 * from the `dark:` variants on <html> (`brandToastOptions`), so there is no
 * need for a second, dark one hidden with CSS — which drew every toast twice
 * and had screen readers announce it twice.
 */
const offset = { bottom: "calc(var(--tab-bar-inset) + 24px)" };
const mobileOffset = { bottom: "calc(var(--tab-bar-inset) + 16px)" };

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Toaster
                position="bottom-center"
                offset={offset}
                mobileOffset={mobileOffset}
                toastOptions={brandToastOptions}
            />
            {children}
        </>
    );
}
