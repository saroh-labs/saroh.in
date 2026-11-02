import { CHANGELOG } from "@/content/changelog";
import { changelogRss } from "@/lib/rss";

export const dynamic = "force-static";

export function GET() {
    return new Response(changelogRss(CHANGELOG), {
        headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
}
