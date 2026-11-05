import { LateFeeTool } from "@/components/tools/late-fee-tool";
import { ToolPage } from "@/components/tools/tool-page";
import { LATE_FEE, MOMENT_LATE_FEE } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/late-fee-calculator");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={LATE_FEE}>
            <LateFeeTool copy={MOMENT_LATE_FEE} />
        </ToolPage>
    );
}
