import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** History on its way, under the header and tabs the layout already drew. */
export default function HistoryLoading() {
    return <PanelSkeleton label="Loading history" rows={6} />;
}
