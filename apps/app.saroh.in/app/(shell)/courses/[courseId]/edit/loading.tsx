import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="full"
            breadcrumb={[
                "Bookings",
                <Link key="1" href="/courses">
                    Courses
                </Link>,
            ]}
            title="Edit course"
            label="Loading the course form"
        />
    );
}
