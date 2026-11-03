import { TaxTool } from "@/components/tools/tax-tool";
import { ToolPage } from "@/components/tools/tool-page";
import { MOMENT_TAX, VAT } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/vat-calculator");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={VAT}>
            <TaxTool kind="vat" tool={VAT.tool} copy={MOMENT_TAX} />
        </ToolPage>
    );
}
