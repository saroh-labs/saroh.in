import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={["Bookings", "Hours and time off"]}
            title="Hours and time off"
            label="Loading availability"
        />
    );
}
