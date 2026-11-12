import { apiFetch, orgBase } from "@/lib/api/http";

import type { TemplatePreviewDetails } from "./template-preview";
import { previewDetailsOf } from "./template-preview";

/**
 * The business's own details a template's preview is drawn with (DEC-216,
 * `GET …/template-preview`). Null when they can't be read: the preview
 * then draws the template's sample business and says so once. Server-only.
 */
export async function readTemplatePreviewDetails(): Promise<TemplatePreviewDetails | null> {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/template-preview`);
        if (!res.ok) return null;
        const body: unknown = await res.json().catch(() => null);
        const data =
            body && typeof body === "object" && "data" in body
                ? body.data
                : body;
        return previewDetailsOf(data);
    } catch {
        return null;
    }
}
