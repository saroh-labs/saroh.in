import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** A Team tab on its way, under the header that stays. */
export default function Loading() {
    return <PanelSkeleton label="Loading the team" rows={6} />;
}
