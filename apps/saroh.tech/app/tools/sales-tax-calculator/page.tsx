import { TaxTool } from "@/components/tools/tax-tool";
import { ToolPage } from "@/components/tools/tool-page";
import { MOMENT_TAX, SALES_TAX } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/sales-tax-calculator");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={SALES_TAX}>
            <TaxTool kind="sales" tool={SALES_TAX.tool} copy={MOMENT_TAX} />
        </ToolPage>
    );
}
