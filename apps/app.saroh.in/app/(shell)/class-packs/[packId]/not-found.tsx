import Link from "next/link";

import { DetailCrumbs } from "@/components/class-packs/pack-detail/detail-crumbs";
import { PageContainer } from "@/components/shared/page-container";

/** The design's not-found: said plainly, with the way back to the packs. */
export default function NotFound() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <DetailCrumbs here="Not found" />
            <div className="px-6 py-10 max-[759px]:px-4">
                <div className="rounded-[12px] border border-dashed border-border-strong px-5 py-[34px] text-center">
                    <h1 className="m-0 text-[15px] font-semibold">
                        That pack isn&apos;t here
                    </h1>
                    <p className="m-0 mt-1 text-[13px] text-muted-foreground">
                        The link may be old, or the draft was deleted.
                    </p>
                    <Link
                        href="/class-packs"
                        className="mt-2 inline-block rounded-[4px] text-[13px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70 coarse:min-h-11 coarse:pt-3"
                    >
                        Back to packs
                    </Link>
                </div>
            </div>
        </PageContainer>
    );
}
