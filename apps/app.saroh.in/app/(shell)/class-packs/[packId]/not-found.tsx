import { packCrumbs } from "@/components/class-packs/pack-editor/pack-crumbs";
import { NotFound } from "@saroh/ui/not-found";
import { PageHeader } from "@saroh/ui/page-header";

import { PageContainer } from "@/components/shared/page-container";

/** The design's not-found: said plainly, with the way back to the packs. */
export default function NotFoundPage() {
    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={packCrumbs("Not found")}
                title="Class pack"
            />
            <div>
                <NotFound
                    variant="card"
                    title="Class pack not found"
                    description="The link may be old, or the draft was deleted."
                    primary={{
                        href: "/class-packs",
                        label: "Back to Class packs",
                    }}
                />
            </div>
        </PageContainer>
    );
}
