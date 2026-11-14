import { notFound } from "next/navigation";

import { AiTab } from "@/components/settings/developers/ai-tab";
import { AskAiTab } from "@/components/settings/developers/ask-ai-tab";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { apiAreaOn } from "@/lib/settings/api-area-switch";

/**
 * Settings › API and AI apps › AI assistants at the desk. On a phone this
 * address is the area's list of tabs (`DevelopersNav`), and the tab itself
 * is at `/ai`. With the API area off and Ask AI on, Ask AI is the only
 * tab, so it is the desk's default here.
 */
export const metadata = { title: "API and AI apps · Settings" };

export default function DevelopersPage() {
    if (!apiAreaOn() && !askAiOn()) notFound();
    return (
        <div className="max-[759px]:hidden">
            {apiAreaOn() ? <AiTab /> : <AskAiTab />}
        </div>
    );
}
