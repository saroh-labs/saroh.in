"use client";

import { brandToastOptions } from "@saroh/ui/sonner";
import { setRefusalTest } from "@saroh/ui/toast";
import { useEffect } from "react";
import { Toaster } from "sonner";

import { isRoleRefusal } from "@/lib/api/role-denied";

/*
 * Toasts rise from the bottom, and below 760px the tab bar lives there: the
 * offsets add its height (`--tab-bar-inset`, 0 where there is no bar) so an
 * Undo is never drawn underneath it. `--bottom-bar-inset` does the same for a
 * sticky action bar (`lib/hooks/use-bottom-bar-inset.ts`).
 *
 * One Toaster for both modes. The toasts are unstyled and take their colours
 * from the `dark:` variants on <html> (`brandToastOptions`), so there is no
 * need for a second, dark one hidden with CSS — which drew every toast twice
 * and had screen readers announce it twice.
 */
/*
 * An open sheet's pinned foot on a phone sets `--overlay-foot-inset`
 * (`overlay-form.tsx`), so a toast said while it is open sits above its
 * buttons rather than over them (BA-23, U3).
 */
const offset = {
    bottom: "calc(max(var(--tab-bar-inset) + var(--bottom-bar-inset, 0px), var(--overlay-foot-inset, 0px)) + 24px)",
};
const mobileOffset = {
    bottom: "calc(max(var(--tab-bar-inset) + var(--bottom-bar-inset, 0px), var(--overlay-foot-inset, 0px)) + 16px)",
};

export function Providers({ children }: { children: React.ReactNode }) {
    // A refusal by role is said calmly wherever a save says it: every
    // `showError(res.error)` in the app asks this first (`role-denied.ts`).
    useEffect(() => setRefusalTest(isRoleRefusal), []);
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
