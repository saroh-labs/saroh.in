import { PageLoading } from "@/components/shared/page/page-loading";

/** `blogdesk/WXWStates` "Loading": the editor's own shape while a post opens. */
export default function Loading() {
    return <PageLoading shape="editor" width="full" label="Opening the post" />;
}
