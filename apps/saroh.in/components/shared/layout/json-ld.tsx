import type { JsonLdObject } from "@/lib/structured-data";
import { jsonLdText } from "@/lib/structured-data";

/** One JSON-LD block for search engines (plan U26); renders nothing visible. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
    return (
        <script
            type="application/ld+json"
            // The text is our own JSON with `<` escaped (`jsonLdText`).
            dangerouslySetInnerHTML={{ __html: jsonLdText(data) }}
        />
    );
}
