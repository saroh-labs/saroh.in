"use client";

import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Toaster className="dark:hidden" />
            <Toaster theme="dark" className="hidden dark:block" />
            {children}
        </>
    );
}
