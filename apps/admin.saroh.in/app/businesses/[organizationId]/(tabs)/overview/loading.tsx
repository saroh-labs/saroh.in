import { PanelSkeleton } from "@/components/states/panel-skeleton";

/**
 * Overview on its way, under the header and tabs the layout already drew:
 * the cards' frames in their places, so nothing moves when they arrive.
 * One sentence for a screen reader; the others are hidden from it.
 */
export default function OverviewLoading() {
    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <PanelSkeleton label="Loading the overview" rows={4} />
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} aria-hidden>
                    <PanelSkeleton label="" rows={3} />
                </div>
            ))}
        </div>
    );
}
