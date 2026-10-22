import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="default"
            breadcrumb={[
                <Link key="0" href="/bookings">
                    Bookings
                </Link>,
                <Link key="1" href="/bookings/all">
                    All bookings
                </Link>,
            ]}
            label="Loading the booking"
        />
    );
}
