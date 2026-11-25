import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="diary"
            width="full"
            breadcrumb={["Bookings"]}
            label="Loading the calendar"
        />
    );
}
