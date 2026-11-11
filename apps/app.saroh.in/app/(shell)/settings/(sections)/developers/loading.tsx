import { PageLoading } from "@/components/shared/page/page-loading";

/** A tab on its way, under the area's header and tabs (the layout's). */
export default function Loading() {
    return (
        <PageLoading shape="list" width="full" label="Loading this tab" bare />
    );
}
