import { packCrumbs } from "@/components/class-packs/pack-editor/pack-crumbs";
import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="editor"
            width="full"
            breadcrumb={packCrumbs("New pack")}
            title="New pack"
            label="Loading the pack editor"
        />
    );
}
