"use client";

import { cn } from "@saroh/ui/lib/utils";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fadesIn } from "@/components/shared/shell/route-fade";

// Module state, so it outlives the remount Next does on each move: the page
// shown last, and where a Back or Forward is going (by address, so one that
// only changed the query can't hold over to the next click). Set only in the
// browser, so a server render always starts from nothing (no fade).
let shownLast: string | null = null;
let historyTo: string | null = null;
let listening = false;

/**
 * A `template`, not a `layout`: Next remounts this on every navigation while a
 * layout persists. That remount is what lets the entrance animation replay per
 * route change — in a layout it would run once per session and never again.
 *
 * It wraps only the page content, NOT the shell. The sidebar and header live in
 * `layout.tsx` and deliberately stay put: re-animating the chrome on every
 * click would make the app feel like it reloads rather than navigates.
 *
 * The fade (`wk-route`, workspace.css) plays only on a move to another
 * section (`fadesIn`): not on the first page, not on Back or Forward, and
 * not within a section. With reduced motion the page simply appears.
 */
export default function ShellTemplate({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [fade] = useState(() =>
        fadesIn(shownLast, pathname, historyTo === pathname),
    );

    useEffect(() => {
        if (!listening) {
            listening = true;
            // Fires before the router renders the page it restores.
            window.addEventListener("popstate", () => {
                historyTo = window.location.pathname;
            });
        }
        shownLast = pathname;
        historyTo = null;
    }, [pathname]);

    return (
        <div className={cn(fade && "wk-route", "flex flex-1 flex-col")}>
            {children}
        </div>
    );
}
