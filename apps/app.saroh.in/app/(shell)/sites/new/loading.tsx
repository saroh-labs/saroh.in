import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={[
                <Link key="0" href="/sites">
                    Website
                </Link>,
                "New site",
            ]}
            title="New site"
            label="Loading the site form"
        />
    );
}
