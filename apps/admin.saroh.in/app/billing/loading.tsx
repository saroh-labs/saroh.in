import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** A Billing tab on its way, under the header that stays. */
export default function Loading() {
    return <PanelSkeleton label="Loading billing" rows={8} />;
}
