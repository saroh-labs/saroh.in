import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={["Bookings", "Availability"]}
            title="Availability"
            label="Loading availability"
        />
    );
}
