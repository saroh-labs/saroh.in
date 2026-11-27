import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="diary"
            width="full"
            breadcrumb={["Bookings"]}
            // The page's own title, so the crumb is skipped here as there.
            title="Bookings"
            label="Loading the calendar"
        />
    );
}
