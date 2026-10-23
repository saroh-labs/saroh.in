import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="detail"
            width="full"
            breadcrumb={[
                <Link key="0" href="/contacts">
                    Contacts
                </Link>,
            ]}
            label="Loading the person"
        />
    );
}
