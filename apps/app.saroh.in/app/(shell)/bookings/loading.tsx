import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="dashboard"
            width="full"
            breadcrumb={["Bookings", "Calendar"]}
            label="Loading the calendar"
        />
    );
}
