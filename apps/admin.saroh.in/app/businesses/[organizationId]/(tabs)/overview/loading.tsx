import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** Overview on its way, under the header and tabs the layout already drew. */
export default function OverviewLoading() {
    return <PanelSkeleton label="Loading the overview" rows={4} />;
}
