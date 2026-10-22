import Link from "next/link";

import { ClassPacksTabs } from "@/components/class-packs/class-packs-tabs";
import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="full"
            breadcrumb={[
                <Link key="0" href="/bookings">
                    Bookings
                </Link>,
                "Class packs",
            ]}
            title="Class packs"
            label="Loading who holds a pack"
            tabs={<ClassPacksTabs current="holders" />}
        />
    );
}
