import { cn } from "@saroh/ui/lib/utils";

import { ViewerDate } from "@/components/shared/viewer-date";

import { Panel, PanelTitle } from "./parts";

export interface TimelineStep {
    key: string;
    what: string;
    at: string;
    who: string | null;
}

/**
 * "What happened": every step, newest first — who moved it and when, from
 * the order's own event log. The newest carries the Saffron dot.
 */
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
    return (
        <Panel aria-labelledby="od-timeline">
            <PanelTitle id="od-timeline" className="mb-2.5">
                What happened
            </PanelTitle>
            <ol>
                {steps.map((s, i) => (
                    <li key={s.key} className="flex gap-[11px] pb-3">
                        <span
                            aria-hidden
                            className={cn(
                                "mt-[5px] size-[9px] shrink-0 rounded-full",
                                i === 0 ? "bg-highlight" : "bg-border-strong",
                            )}
                        />
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold">
                                {s.what}
                            </div>
                            <div className="mt-px text-[12px] text-muted-foreground">
                                <ViewerDate iso={s.at} variant="moment" />
                                {s.who ? ` · ${s.who}` : null}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </Panel>
    );
}
