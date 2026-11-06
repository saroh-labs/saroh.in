import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="full"
            breadcrumb={[
                "Bookings",
                <Link data-ph-unmask="" key="1" href="/courses">
                    Courses
                </Link>,
            ]}
            title="Edit course"
            label="Loading the course form"
        />
    );
}
