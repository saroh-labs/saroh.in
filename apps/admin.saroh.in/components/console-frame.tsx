import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";

/**
 * The console's frame: the sticky 56px bar and the rail beside the work
 * area. `AdminShell` fills it with the real pieces; `ConsoleLoading` with
 * their shapes, so a page on its way keeps the frame where it was. No
 * server imports, so a client loading screen can draw it.
 */
export function ConsoleFrame({
    drawer,
    search,
    account,
    rail,
    banner,
    children,
}: {
    drawer?: React.ReactNode;
    search: React.ReactNode;
    account: React.ReactNode;
    rail: React.ReactNode;
    banner?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col">
            {/* Sticky, at a fixed 56px from 640px up, so the rail (from
                760px) can sit exactly below it and only the work area moves
                with the page. On a phone, where there is no rail, the search
                takes a second row of its own. */}
            <header className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background px-3 py-2 sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0">
                {drawer}
                <Link href="/" className="shrink-0">
                    <Wordmark suffix="console" />
                </Link>
                <div className="order-last flex min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
                    {search}
                </div>
                <div className="ml-auto flex min-w-0 items-center gap-3">
                    {account}
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                {rail}
                {/* The work area steps up from the ground in dark, which is
                    the design system's rule read in the console's direction.
                    Not a <main>: each screen's `PageContainer` is that. */}
                <div className="min-w-0 flex-1 bg-card/40">
                    {/* In the work area rather than across the top, so the
                        header and rail keep one fixed height to stick at. */}
                    {banner}
                    {children}
                </div>
            </div>
        </div>
    );
}
