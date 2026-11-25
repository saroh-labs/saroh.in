import { HOURS_LEAD } from "@/components/bookings/availability/hours-header";
import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={["Bookings", "Hours and time off"]}
            title="Hours and time off"
            description={HOURS_LEAD}
            label="Loading availability"
        />
    );
}
