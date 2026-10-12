import type { ReactNode } from "react";

/**
 * A passthrough, deliberately.
 *
 * This used to centre a column and put the wordmark above it, which was the
 * whole of the shared chrome. `SplitShell` carries the mark now, and each page
 * wraps itself in one — because the panel beside the form says something
 * different on every page, and a layout cannot know which page it is wrapping
 * without reading the URL back out of the router.
 *
 * No title here either: each page names itself, on the root layout's
 * "%s · Saroh".
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
