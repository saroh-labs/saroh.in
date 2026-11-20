import { cn } from "@saroh/ui/lib/utils";

import type { DiffRun, ParagraphDiff } from "@/lib/sites/post-diff";

const ADDED =
    "rounded-[2px] bg-success-subtle px-px text-success-subtle-foreground no-underline";
const REMOVED =
    "rounded-[2px] bg-destructive-subtle px-px text-destructive-subtle-foreground line-through";

/** A line's runs, put in green and taken out red and struck through. */
export function DiffRuns({ runs }: { runs: DiffRun[] }) {
    return runs.map((r, i) =>
        r.kind === "added" ? (
            <ins key={i} className={ADDED}>
                {r.text}
            </ins>
        ) : r.kind === "removed" ? (
            <del key={i} className={REMOVED}>
                {r.text}
            </del>
        ) : (
            <span key={i}>{r.text}</span>
        ),
    );
}

/**
 * A compared post as paragraphs (`paragraphDiff`): each changed one carries
 * `data-change` (its number among the changes), for Next change.
 */
export function DiffParagraphs({
    paragraphs,
    label,
}: {
    paragraphs: ParagraphDiff[];
    /** The words over a changed paragraph, or none. */
    label?: (n: number, of: number) => string;
}) {
    const of = paragraphs.filter((p) => p.kind !== "same").length;
    let n = 0;
    return (
        <div className="space-y-4 text-[15px] leading-relaxed">
            {paragraphs.map((p, i) => {
                if (p.kind === "same") return <p key={i}>{p.text}</p>;
                n++;
                return (
                    <div
                        key={i}
                        data-change={n}
                        tabIndex={-1}
                        className={cn(
                            "scroll-mt-16 outline-none",
                            label && "-mx-2 rounded-md p-2 ring-1 ring-border",
                        )}
                    >
                        {label ? (
                            <span className="mb-1 block font-sans text-xs font-semibold text-muted-foreground">
                                {label(n, of)}
                            </span>
                        ) : null}
                        <p>
                            {p.kind === "changed" ? (
                                <DiffRuns runs={p.runs} />
                            ) : (
                                <DiffRuns runs={[p]} />
                            )}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

/** The key under a comparison: what green and red mean here. */
export function DiffKey({
    added,
    removed,
}: {
    added: string;
    removed: string;
}) {
    return (
        <span className="inline-flex items-center gap-3 font-sans text-[0.8125rem] text-foreground/80">
            <span className="inline-flex items-center gap-1.5">
                <i
                    aria-hidden
                    className="size-3 rounded-[3px] bg-success-subtle ring-1 ring-success/40"
                />
                {added}
            </span>
            <span className="inline-flex items-center gap-1.5">
                <i
                    aria-hidden
                    className="size-3 rounded-[3px] bg-destructive-subtle ring-1 ring-destructive/40"
                />
                {removed}
            </span>
        </span>
    );
}
