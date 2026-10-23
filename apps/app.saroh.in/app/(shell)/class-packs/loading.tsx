import Link from "next/link";

import { ClassPacksTabs } from "@/components/class-packs/list/class-packs-tabs";
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
            label="Loading class packs"
            tabs={<ClassPacksTabs current="packs" />}
        />
    );
}
