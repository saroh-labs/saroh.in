"use client";

import { brandToastOptions } from "@saroh/ui/sonner";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Toaster
                className="dark:hidden"
                position="bottom-center"
                toastOptions={brandToastOptions}
            />
            <Toaster
                theme="dark"
                className="hidden dark:block"
                position="bottom-center"
                toastOptions={brandToastOptions}
            />
            {children}
        </>
    );
}
