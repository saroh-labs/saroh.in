import { TaxTool } from "@/components/tools/tax-tool";
import { ToolPage } from "@/components/tools/tool-page";
import { GST, MOMENT_TAX } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/gst-calculator");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={GST}>
            <TaxTool kind="gst" tool={GST.tool} copy={MOMENT_TAX} />
        </ToolPage>
    );
}
