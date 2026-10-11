import { PageLoading } from "@/components/shared/page-loading";

export default function Loading() {
    return (
        <PageLoading
            shape="form"
            width="form"
            breadcrumb={["Settings", "Project modules"]}
            title="Project modules"
            label="Loading the project's modules"
        />
    );
}
