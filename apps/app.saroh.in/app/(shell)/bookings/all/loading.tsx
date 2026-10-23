import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            title="All bookings"
            label="Loading bookings"
        />
    );
}
