import Link from "next/link";

import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                <Link key="0" href="/sites">
                    Website
                </Link>,
            ]}
            label="Loading the post"
        />
    );
}
