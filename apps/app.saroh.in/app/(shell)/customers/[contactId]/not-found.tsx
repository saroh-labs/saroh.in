import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

/** The design's not-found: said plainly, with the way back. */
export default function NotFound() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <div className="px-[26px] pb-10 pt-[50px]">
                <div className="rounded-xl border border-dashed border-border-strong px-[22px] py-[34px] text-center">
                    <h1 className="font-display text-[17px] font-semibold">
                        This customer isn&apos;t here
                    </h1>
                    <p className="mx-auto mt-1.5 max-w-[46ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                        They may have been removed, or the link is wrong. Their
                        past orders are still in Orders.
                    </p>
                </div>
                <div className="mt-3 flex justify-center">
                    <Link
                        href="/contacts"
                        className="inline-flex h-8 items-center rounded-[9px] border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-muted coarse:h-11"
                    >
                        Back to contacts
                    </Link>
                </div>
            </div>
        </PageContainer>
    );
}
