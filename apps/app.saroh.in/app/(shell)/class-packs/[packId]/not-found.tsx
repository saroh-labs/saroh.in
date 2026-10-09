import { NotFound } from "@saroh/ui/not-found";

import { DetailCrumbs } from "@/components/class-packs/pack-detail/detail-crumbs";
import { PageContainer } from "@/components/shared/page-container";

/** The design's not-found: said plainly, with the way back to the packs. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <DetailCrumbs here="Not found" />
            <div className="px-6 py-10 max-[759px]:px-4">
                <NotFound
                    variant="card"
                    title="That pack isn't here"
                    description="The link may be old, or the draft was deleted."
                    primary={{ href: "/class-packs", label: "Back to packs" }}
                />
            </div>
        </PageContainer>
    );
}
