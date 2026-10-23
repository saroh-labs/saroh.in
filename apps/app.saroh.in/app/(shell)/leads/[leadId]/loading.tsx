import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="default"
            breadcrumb={[
                <Link key="0" href="/leads">
                    Leads
                </Link>,
            ]}
            label="Loading the lead"
        />
    );
}
