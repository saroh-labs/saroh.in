import { notFound } from "next/navigation";

import { AskAiTab } from "@/components/settings/developers/ask-ai-tab";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";

/** Ask AI as its own address: the tab, and where the phone's list opens it. */
export const metadata = { title: "Ask AI · API and AI apps · Settings" };

export default function AskAiPage() {
    if (!askAiOn()) notFound();
    return <AskAiTab />;
}
