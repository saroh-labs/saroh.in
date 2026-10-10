import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={[
                "Sell",
                <Link key="1" href="/commerce/locations">
                    Location
                </Link>,
                "New",
            ]}
            title="New location"
            label="Loading the location form"
        />
    );
}
