import { AbsentValue } from "@saroh/ui/absent-value";
import { cn } from "@saroh/ui/lib/utils";
import {
    Banknote,
    CalendarClock,
    CircleCheck,
    IndianRupee,
    Package,
} from "lucide-react";
import Link from "next/link";

import type { TileView } from "@/lib/home/tiles";

/**
 * Home A's tiles (DEC-171, plan U6, boards `HAPageD`, `HAQuietD`,
 * `HAMemberD`, `HAFailedD`): today at a glance, each a link to the screen
 * that answers it (`HATilesD`). Four for an owner, three for a role
 * without money; a tile whose read failed shows a dash and why, never 0.
 *
 * The figures and their lines are the business's, so they stay masked in
 * a session recording; only the tile's fixed name is readable (DEC-125).
 * The phone's three figures (U17) read the same `tileViews`.
 */
export function TodayTiles({ tiles }: { tiles: readonly TileView[] }) {
    if (tiles.length === 0) return null;
    return (
        <ul
            aria-label="Today at a glance"
            className={cn(
                "grid grid-cols-2 gap-3",
                tiles.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
            )}
        >
            {tiles.map((tile) => (
                <li key={tile.key} className="min-w-0">
                    <Tile tile={tile} />
                </li>
            ))}
        </ul>
    );
}

/** The tile's glyph: one per meaning, as the boards draw them. */
function TileIcon({ tile }: { tile: TileView }) {
    const cls = "size-4 shrink-0";
    switch (tile.key) {
        case "bookings":
            return <CalendarClock aria-hidden className={cls} />;
        case "toPack":
            return <Package aria-hidden className={cls} />;
        case "came":
            return <CircleCheck aria-hidden className={cls} />;
        case "moneyIn":
            return tile.currency && tile.currency !== "INR" ? (
                <Banknote aria-hidden className={cls} />
            ) : (
                <IndianRupee aria-hidden className={cls} />
            );
    }
}

function Tile({ tile }: { tile: TileView }) {
    return (
        <Link
            href={tile.href}
            data-tile={tile.key}
            className="flex h-full min-h-[104px] flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5 text-foreground transition-colors duration-fast hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted"
        >
            <span
                data-ph-unmask=""
                className="flex items-center gap-[7px] text-[12.5px] font-medium text-muted-foreground"
            >
                <TileIcon tile={tile} />
                {tile.label}
            </span>
            <span className="font-display text-[26px] font-semibold tabular-nums leading-[1.15] tracking-[-0.03em]">
                {tile.value ?? <AbsentValue says={tile.absent ?? "None"} />}
            </span>
            <span className="text-pretty text-[12.5px] leading-[1.4] text-neutral-700 dark:text-muted-foreground">
                {tile.sub}
            </span>
        </Link>
    );
}
