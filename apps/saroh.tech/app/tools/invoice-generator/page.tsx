import { DocumentEditor } from "@/components/tools/document-editor";
import { ToolPage } from "@/components/tools/tool-page";
import { INVOICE, MOMENT_INVOICE } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/invoice-generator");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={INVOICE}>
            <DocumentEditor
                kind="invoice"
                tool={INVOICE.tool}
                copy={MOMENT_INVOICE}
            />
        </ToolPage>
    );
}
