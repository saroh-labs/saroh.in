import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** A teammate's tab on its way, under the header that stays. */
export default function Loading() {
    return <PanelSkeleton label="Loading the teammate" rows={4} />;
}
