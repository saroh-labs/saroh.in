import { ProgressBar } from "@saroh/ui/progress-bar";

import { loadOf, loadWords } from "@/lib/team-words";

/**
 * How many businesses a teammate looks after against how many they can
 * take (R30). Full at capacity: the bar fills and turns to the warning
 * tone, and the words say "full". With no capacity set there is no bar,
 * only the count.
 */
export function LoadBar({
    count,
    capacity,
}: {
    count: number;
    capacity: number | null;
}) {
    const load = loadOf(count, capacity);
    const words = loadWords(load);
    return (
        <div
            className="grid min-w-0 gap-1"
            data-load-full={load.full ? "" : undefined}
        >
            <span
                className={
                    load.full
                        ? "text-[13px] font-medium text-warning-subtle-foreground"
                        : "text-[13px] text-muted-foreground"
                }
            >
                {words}
            </span>
            {load.capacity !== null && (
                <ProgressBar
                    size="xs"
                    value={load.count}
                    max={load.capacity}
                    tone={load.full ? "warning" : "success"}
                    label={words}
                    className="max-w-40"
                />
            )}
        </div>
    );
}
