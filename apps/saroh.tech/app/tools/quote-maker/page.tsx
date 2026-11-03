import { DocumentEditor } from "@/components/tools/document-editor";
import { ToolPage } from "@/components/tools/tool-page";
import { MOMENT_QUOTE, QUOTE } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/quote-maker");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={QUOTE}>
            <DocumentEditor
                kind="quote"
                tool={QUOTE.tool}
                copy={MOMENT_QUOTE}
            />
        </ToolPage>
    );
}
