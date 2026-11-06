import Link from "next/link";

import { PageLoading } from "@/components/shared/page/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={[
                <Link data-ph-unmask="" key="0" href="/bookings">
                    Bookings
                </Link>,
                <Link data-ph-unmask="" key="1" href="/services">
                    Services
                </Link>,
            ]}
            label="Loading the service"
        />
    );
}
