"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, useContext, useTransition } from "react";

/**
 * A change inside a screen that only moves its search params (a filter, a
 * date, a person, a sort): Next shows no `loading.tsx` for it, and the old
 * rows would hold unmarked until the new render lands
 * (docs/patterns/frontend-data-and-state.md, "Loading inside a screen").
 * `ScreenPending` runs those navigations in one transition, and
 * `PendingRegion` greys only the region whose data changes; the header,
 * tabs and filters around it stay as they are.
 */
interface ScreenPendingValue {
    pending: boolean;
    /** Open an address of this screen, the old content marked meanwhile. */
    go: (href: string, how?: "push" | "replace") => void;
}

const ScreenPendingContext = createContext<ScreenPendingValue | null>(null);

export function ScreenPending({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const go = (href: string, how: "push" | "replace" = "push") =>
        start(() => router[how](href, { scroll: false }));
    return (
        <ScreenPendingContext.Provider value={{ pending, go }}>
            {children}
        </ScreenPendingContext.Provider>
    );
}

/**
 * The screen's `go`, or a plain `router.push` outside one (a test, a
 * screen that hasn't a region yet).
 */
export function useScreenGo(): ScreenPendingValue["go"] {
    const ctx = useContext(ScreenPendingContext);
    const router = useRouter();
    return (
        ctx?.go ??
        ((href, how = "push") => router[how](href, { scroll: false }))
    );
}

/**
 * A `<Link>`'s `onNavigate` that sends its client navigation through the
 * screen's transition: a modified click (a new tab) is still the browser's.
 */
export function useScreenLink(): (
    href: string,
) => (e: { preventDefault: () => void }) => void {
    const ctx = useContext(ScreenPendingContext);
    return (href) => (e) => {
        if (!ctx) return;
        e.preventDefault();
        ctx.go(href);
    };
}

/** Whether the screen's last change is still on its way. */
export function useScreenPending(): boolean {
    return useContext(ScreenPendingContext)?.pending ?? false;
}

/**
 * The region whose data changes: kept on screen and greyed while the next
 * render is on its way, never blanked, never a full-screen skeleton.
 */
export function PendingRegion({
    pending: own,
    rows = false,
    className,
    children,
}: {
    /** A transition of the region's own, instead of the screen's. */
    pending?: boolean;
    /**
     * Grey only the lists inside (`data-list-table`): a panel whose filters
     * sit beside its rows keeps the filters as they are.
     */
    rows?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const screen = useScreenPending();
    const pending = own ?? screen;
    return (
        <div
            aria-busy={pending || undefined}
            data-pending={pending ? "" : undefined}
            className={cn(
                rows
                    ? "[&_[data-list-table]]:transition-opacity [&_[data-list-table]]:duration-fast"
                    : "transition-opacity duration-fast",
                // Held a beat, so a quick switch doesn't flicker.
                pending &&
                    (rows
                        ? "[&_[data-list-table]]:opacity-60 [&_[data-list-table]]:delay-150"
                        : "opacity-60 delay-150"),
                className,
            )}
        >
            {children}
        </div>
    );
}
