import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** A release's tab on its way, under the header that stays. */
export default function ReleaseTabLoading() {
    return <PanelSkeleton label="Loading the release" />;
}
