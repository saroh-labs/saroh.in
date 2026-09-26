import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

/** An invoice that isn't here — never was, or is another business's. */
export default function NotFound() {
    return (
        <PageContainer width="full">
            <div className="p-10 text-center">
                <h1 className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                    No invoice at this address
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    It may belong to another business, or the link is wrong.
                </p>
                <Link
                    href="/billing/invoices"
                    className="mt-2.5 inline-block text-[13px] font-semibold text-brand hover:text-foreground"
                >
                    Back to invoices
                </Link>
            </div>
        </PageContainer>
    );
}
