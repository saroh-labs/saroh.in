import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="list"
            width="default"
            breadcrumb={[
                <Link key="0" href="/sites">
                    Website
                </Link>,
                "Version history",
            ]}
            title="Version history"
            label="Loading the versions"
        />
    );
}
