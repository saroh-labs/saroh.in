import { IntentLink } from "@saroh/ui/intent-link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="full"
            breadcrumb={[
                "Bookings",
                <IntentLink data-ph-unmask="" key="1" href="/courses">
                    Courses
                </IntentLink>,
                "New course",
            ]}
            title="New course"
            label="Loading the course form"
        />
    );
}
