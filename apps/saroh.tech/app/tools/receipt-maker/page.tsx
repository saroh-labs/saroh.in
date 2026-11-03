import { ReceiptTool } from "@/components/tools/receipt-tool";
import { ToolPage } from "@/components/tools/tool-page";
import { MOMENT_RECEIPT, RECEIPT } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/receipt-maker");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={RECEIPT}>
            <ReceiptTool copy={MOMENT_RECEIPT} />
        </ToolPage>
    );
}
