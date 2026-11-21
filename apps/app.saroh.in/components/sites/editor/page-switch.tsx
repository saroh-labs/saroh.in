"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, useContext, useState, useTransition } from "react";

import { PageLoading } from "@/components/shared/page/page-loading";

interface PageSwitch {
    /** Open another page of the site: a client navigation, in a transition. */
    open: (pageId: string) => void;
    /** The next page is on its way: the canvas and inspector grey. */
    pending: boolean;
    /** It couldn't be fetched (offline): the canvas says so, with Try again. */
    failed: boolean;
    retry: () => void;
}

const PageSwitchContext = createContext<PageSwitch | null>(null);

/**
 * Opening another page of the site editor (`?page=`). The navigation runs
 * in a transition, so the editor stays on screen with its canvas and
 * inspector grey until the page lands (Next: "useTransition" with
 * `router.push`), never a whole-screen loader. Offline, the fetch would fail
 * and Next would fall back to a full page load, the browser's own error
 * page: so it isn't tried, and the canvas says "Couldn't load this page"
 * with Try again instead.
 */
export function PageSwitchProvider({
    siteId,
    children,
}: {
    siteId: string;
    children: ReactNode;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [failedFor, setFailedFor] = useState<string | null>(null);
    const open = (pageId: string) => {
        // shortcut: only a known-offline browser is caught; a request that
        // fails while "online" still falls back to Next's full page load.
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            setFailedFor(pageId);
            return;
        }
        setFailedFor(null);
        startTransition(() => router.push(`/sites/${siteId}?page=${pageId}`));
    };
    return (
        <PageSwitchContext.Provider
            value={{
                open,
                pending,
                failed: failedFor !== null,
                retry: () => {
                    if (failedFor) open(failedFor);
                },
            }}
        >
            {children}
        </PageSwitchContext.Provider>
    );
}

/** Opens a page: through the switch when the editor has one. */
export function useOpenPageId(siteId: string): (pageId: string) => void {
    const router = useRouter();
    const ctx = useContext(PageSwitchContext);
    return (
        ctx?.open ??
        ((pageId: string) => router.push(`/sites/${siteId}?page=${pageId}`))
    );
}

/**
 * A region of the editor that belongs to the page (the canvas, the
 * inspector): its own skeleton while another page loads, and, for the
 * canvas, "Couldn't load this page" when it couldn't.
 */
export function PageRegion({
    shape,
    children,
}: {
    shape: "canvas" | "inspector";
    children: ReactNode;
}) {
    const ctx = useContext(PageSwitchContext);
    if (ctx?.pending) {
        return (
            <PageLoading
                shape={shape}
                width="full"
                bare
                bodyClassName="min-h-0"
                label={
                    shape === "canvas"
                        ? "Opening the page"
                        : "Loading the page's sections"
                }
            />
        );
    }
    if (ctx?.failed && shape === "canvas") {
        return (
            <div className="grid min-h-0 place-items-center p-6">
                <FailedState
                    title={couldntLoad("this page")}
                    description="You may be offline. Nothing you wrote is lost."
                    onRetry={ctx.retry}
                />
            </div>
        );
    }
    return <>{children}</>;
}
