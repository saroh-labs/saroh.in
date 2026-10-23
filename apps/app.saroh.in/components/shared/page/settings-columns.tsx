import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * The layout of a settings-style screen made of rows: Sell › Location,
 * Website › Settings and Settings › Business.
 *
 * One column up to 760px: the notes, the "what's left" card, then the tabs
 * and their rows. From a 1440px window the rows grow to 1040px and the card
 * moves to the right of them and stays in view while a tab is worked
 * through, so the page uses its width (owner, 10 Oct 2026). With something
 * else already beside the rows (`beside`: the list of locations, a section
 * list) the rows still grow from 1440px, and the card moves from 1760px,
 * where there is room for it.
 *
 * The card comes first for the keyboard at every width. A screen with no
 * card gets the same measure, so every such screen is as wide as the next.
 */
export function SettingsColumns({
    aside,
    before,
    beside = false,
    className,
    children,
}: {
    /** The "what's left" card; left out when nothing is left. */
    aside?: ReactNode;
    /** Notes above everything (paused, read only). */
    before?: ReactNode;
    /** Something else sits beside the rows already. */
    beside?: boolean;
    className?: string;
    /** The tabs and the open tab's rows. */
    children: ReactNode;
}) {
    const wide = beside ? WIDE_BESIDE : WIDE_ALONE;
    return (
        <div
            data-slot="settings-columns"
            className={cn(
                "flex min-w-0 max-w-[760px] flex-1 flex-col gap-4",
                wide.frame,
                className,
            )}
        >
            {aside ? (
                <div
                    data-slot="settings-aside"
                    className={cn("order-2 min-w-0", wide.aside)}
                >
                    {aside}
                </div>
            ) : null}
            <div className={cn("contents", wide.main)}>
                {before ? (
                    <div className="order-1 flex min-w-0 flex-col gap-4">
                        {before}
                    </div>
                ) : null}
                <div
                    data-slot="settings-rows"
                    className="order-3 flex min-w-0 flex-col gap-4"
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

/** Whole class names, so Tailwind finds them. */
const WIDE_ALONE = {
    frame: "min-[1440px]:max-w-none min-[1440px]:flex-row min-[1440px]:items-start min-[1440px]:gap-8",
    main: "min-[1440px]:flex min-[1440px]:min-w-0 min-[1440px]:max-w-[1040px] min-[1440px]:flex-1 min-[1440px]:flex-col min-[1440px]:gap-4",
    aside: "min-[1440px]:sticky min-[1440px]:top-6 min-[1440px]:order-last min-[1440px]:w-[400px] min-[1440px]:shrink-0",
};
const WIDE_BESIDE = {
    frame: "min-[1440px]:max-w-[1040px] min-[1760px]:max-w-none min-[1760px]:flex-row min-[1760px]:items-start min-[1760px]:gap-8",
    main: "min-[1760px]:flex min-[1760px]:min-w-0 min-[1760px]:max-w-[1040px] min-[1760px]:flex-1 min-[1760px]:flex-col min-[1760px]:gap-4",
    aside: "min-[1760px]:sticky min-[1760px]:top-6 min-[1760px]:order-last min-[1760px]:w-[400px] min-[1760px]:shrink-0",
};
