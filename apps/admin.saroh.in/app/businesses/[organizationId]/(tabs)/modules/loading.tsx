import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** Modules on its way, under the header and tabs the layout already drew. */
export default function ModulesLoading() {
    return <PanelSkeleton label="Loading modules" rows={6} />;
}
