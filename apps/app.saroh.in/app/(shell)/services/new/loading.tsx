import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                <Link key="0" href="/bookings">
                    Bookings
                </Link>,
                <Link key="1" href="/services">
                    Services
                </Link>,
                "New service",
            ]}
            title="New service"
            label="Loading the service editor"
        />
    );
}
