"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";

import { PageLoading } from "@/components/shared/page/page-loading";
import {
    armFullLoadCatch,
    resetRouterAfterCatch,
} from "@/lib/navigation/caught-full-load";

interface PageSwitch {
    /** Open another page of the site: a client navigation, in a transition. */
    open: (pageId: string) => void;
    /** The next page is on its way: the canvas and inspector grey. */
    pending: boolean;
    /** It couldn't be fetched: the canvas says so, with Try again. */
    failed: boolean;
    retry: () => void;
}

const PageSwitchContext = createContext<PageSwitch | null>(null);

/**
 * Opening another page of the site editor (`?page=`). The navigation runs
 * in a transition, so the editor stays on screen with its canvas and
 * inspector grey until the page lands (Next: "useTransition" with
 * `router.push`), never a whole-screen loader. When the page can't be
 * fetched, Next would fall back to a full page load (the browser's own error
 * page offline): a known-offline browser isn't tried, and a fetch that fails
 * while "online" is caught (`caught-full-load.ts`). Either way the canvas
 * says "Couldn't load this page" with Try again, and the frame stays.
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
    const disarm = useRef<(() => void) | null>(null);
    // Pages whose load was caught once: a second failure is let through to
    // Next's full load, so a sign-in or a new deploy still gets there.
    const caughtOnce = useRef(new Set<string>());
    const open = (pageId: string) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            setFailedFor(pageId);
            return;
        }
        setFailedFor(null);
        const href = `/sites/${siteId}?page=${pageId}`;
        disarm.current?.();
        disarm.current = caughtOnce.current.has(pageId)
            ? null
            : armFullLoadCatch(
                  (url) =>
                      url.pathname === `/sites/${siteId}` &&
                      url.searchParams.get("page") === pageId,
                  () => {
                      disarm.current = null;
                      caughtOnce.current.add(pageId);
                      setFailedFor(pageId);
                      // The address never moved: Next draws this page again
                      // and the transition ends.
                      resetRouterAfterCatch();
                  },
              );
        startTransition(() => router.push(href));
    };
    // The page landed (or was caught): nothing left to catch.
    useEffect(() => {
        if (pending) return;
        disarm.current?.();
        disarm.current = null;
    }, [pending]);
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
    if (ctx?.failed && shape === "canvas") {
        return (
            <div className="grid min-h-0 place-items-center p-6">
                <FailedState
                    title={couldntLoad("this page")}
                    description="Check your connection. Nothing you wrote is lost."
                    onRetry={ctx.retry}
                />
            </div>
        );
    }
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
    return <>{children}</>;
}
