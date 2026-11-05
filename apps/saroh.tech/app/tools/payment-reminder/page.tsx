import { ReminderTool } from "@/components/tools/reminder-tool";
import { ToolPage } from "@/components/tools/tool-page";
import { MOMENT_REMINDER, REMINDER } from "@/content/tools";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/tools/payment-reminder");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <ToolPage page={page} content={REMINDER}>
            <ReminderTool copy={MOMENT_REMINDER} />
        </ToolPage>
    );
}
