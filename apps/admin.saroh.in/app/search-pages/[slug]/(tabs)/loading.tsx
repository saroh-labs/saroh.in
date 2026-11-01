import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** A search page's tab on its way, under the header that stays. */
export default function Loading() {
    return <PanelSkeleton label="Loading the search page" rows={4} />;
}
