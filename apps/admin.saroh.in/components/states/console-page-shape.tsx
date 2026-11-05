import { PageContainer } from "@saroh/ui/page-container";
import { Skeleton } from "@saroh/ui/skeleton";

import { PanelSkeleton } from "./panel-skeleton";

/** Which shape a console address draws while it loads. */
export type ConsoleSkeleton = "list" | "board" | "detail";

/**
 * The page's own shape while it loads, without the frame: for a section
 * whose layout keeps the console drawn (Search pages), and inside
 * `ConsoleLoading`'s frame.
 */
export function ConsolePageShape({
    shape,
    label,
}: {
    shape: ConsoleSkeleton;
    label: string;
}) {
    return (
        <PageContainer width="full">
            <div className="grid min-w-0 gap-5">
                <div aria-hidden className="grid gap-2.5">
                    <Skeleton className="h-3 w-28 rounded-[4px]" />
                    <Skeleton className="h-7 w-56 rounded-[6px]" />
                    <Skeleton className="h-4 w-full max-w-md rounded-[4px]" />
                </div>
                {shape === "detail" ? (
                    <>
                        <div
                            aria-hidden
                            className="flex gap-4 border-b border-border pb-2"
                        >
                            {[64, 80, 56, 72, 60].map((w) => (
                                <Skeleton
                                    key={w}
                                    className="h-5"
                                    style={{ width: w }}
                                />
                            ))}
                        </div>
                        <div className="grid gap-6 lg:grid-cols-2">
                            <PanelSkeleton label={label} rows={4} />
                            <div aria-hidden>
                                <PanelSkeleton label="" rows={4} />
                            </div>
                        </div>
                    </>
                ) : shape === "board" ? (
                    <>
                        <span role="status" className="sr-only">
                            {label}
                        </span>
                        <div
                            aria-hidden
                            className="grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-6"
                        >
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className="grid content-start gap-2"
                                >
                                    <Skeleton className="h-5 w-24 rounded-[4px]" />
                                    <Skeleton className="h-24 rounded-[11px]" />
                                    <Skeleton className="h-24 rounded-[11px]" />
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <Skeleton aria-hidden className="h-10 rounded-[11px]" />
                        <PanelSkeleton label={label} rows={8} />
                    </>
                )}
            </div>
        </PageContainer>
    );
}
