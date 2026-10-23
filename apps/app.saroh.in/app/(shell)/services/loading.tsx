import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={["Bookings", "Services"]}
            title="Services"
            label="Loading services"
        />
    );
}
