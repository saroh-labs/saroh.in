import { notFound } from "next/navigation";

import { AiTab } from "@/components/settings/developers/ai-tab";
import { apiAreaOn } from "@/lib/settings/api-area-switch";

/** AI assistants as its own address: where the phone's list opens it. */
export const metadata = { title: "AI assistants · API and AI apps · Settings" };

export default function AiAssistantsPage() {
    if (!apiAreaOn()) notFound();
    return <AiTab />;
}
