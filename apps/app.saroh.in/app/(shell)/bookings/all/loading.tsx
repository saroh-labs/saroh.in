import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={[
                <Link key="0" href="/bookings">
                    Bookings
                </Link>,
                "All bookings",
            ]}
            title="All bookings"
            label="Loading bookings"
        />
    );
}
