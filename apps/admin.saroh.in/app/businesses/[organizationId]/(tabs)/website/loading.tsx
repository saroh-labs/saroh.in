import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** Website on its way, under the header and tabs the layout already drew. */
export default function WebsiteLoading() {
    return <PanelSkeleton label="Loading trackers" rows={3} />;
}
