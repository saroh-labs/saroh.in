import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** Team on its way, under the header and tabs the layout already drew. */
export default function TeamLoading() {
    return <PanelSkeleton label="Loading the team" rows={4} />;
}
