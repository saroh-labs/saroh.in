import { cn } from "../cn";
import { ring } from "../ring";

/**
 * The phone's "Free vs Grow · Grow vs Pro" switch over a plan table: toggle
 * buttons in the Pricing boards' segment, shown below 760px only (a desk
 * sees every column).
 */
export function SegmentPairs({
    label,
    items,
    chosen,
    onChoose,
}: {
    label: string;
    items: readonly string[];
    chosen: number;
    onChoose: (i: number) => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="flex gap-0.5 rounded-mk-btn border border-border bg-card p-1 min-[760px]:hidden"
        >
            {items.map((t, i) => (
                <button
                    key={t}
                    type="button"
                    aria-pressed={i === chosen}
                    onClick={() => onChoose(i)}
                    className={cn(
                        `h-11 flex-1 cursor-pointer rounded-mk-control border-none px-2 text-sm font-semibold transition-colors duration-fast ease-out ${ring()} active:scale-[0.98]`,
                        i === chosen
                            ? "bg-foreground text-background"
                            : "bg-transparent text-mk-copy hover:bg-mk-hover",
                    )}
                >
                    {t}
                </button>
            ))}
        </div>
    );
}
