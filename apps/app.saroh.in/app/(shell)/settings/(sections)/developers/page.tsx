import { AiTab } from "@/components/settings/developers/ai-tab";

/**
 * Settings › API and AI apps › AI assistants at the desk. On a phone this
 * address is the area's list of tabs (`DevelopersNav`), and the tab itself
 * is at `/ai`.
 */
export const metadata = { title: "API and AI apps · Settings" };

export default function DevelopersPage() {
    return (
        <div className="max-[759px]:hidden">
            <AiTab />
        </div>
    );
}
