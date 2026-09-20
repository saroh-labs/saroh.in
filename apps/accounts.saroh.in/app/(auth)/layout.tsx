import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Login | Saroh",
    description:
        "Login to saroh. A platform for managing your portfolios, marketing websites and more.",
};

/**
 * A passthrough, deliberately.
 *
 * This used to centre a column and put the wordmark above it, which was the
 * whole of the shared chrome. `SplitShell` carries the mark now, and each page
 * wraps itself in one — because the panel beside the form says something
 * different on every page, and a layout cannot know which page it is wrapping
 * without reading the URL back out of the router.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
