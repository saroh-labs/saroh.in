import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** Billing on its way, under the header and tabs the layout already drew. */
export default function BillingLoading() {
    return <PanelSkeleton label="Loading plan and limits" rows={5} />;
}
