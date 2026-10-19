import { PageContainer } from "@saroh/ui/page-container";

import { PanelSkeleton } from "@/components/states/panel-skeleton";

export default function LeadsLoading() {
    return (
        <PageContainer>
            <PanelSkeleton label="Loading leads" rows={5} />
        </PageContainer>
    );
}
