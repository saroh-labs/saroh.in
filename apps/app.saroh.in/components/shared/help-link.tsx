import { CircleHelp } from "lucide-react";

import type { HelpTopic } from "@/lib/help/links";
import { HELP_URL, helpUrl } from "@/lib/help/links";

/**
 * The way out of a stuck moment.
 *
 * The 2026-08-02 audit scored Help and Documentation 1/10, and the finding was
 * blunt: there was no help link, docs link, tooltip or support contact anywhere
 * in the product, while `help.saroh.in` existed as a built app linked from
 * nowhere. Someone who did not know what "readiness" meant had no move except
 * to leave.
 *
 * It sits in the top bar rather than buried in the account menu because being
 * stuck is not an account-settings frame of mind, and it opens in a new tab so
 * reading an article never costs a merchant the half-filled form they were
 * looking at.
 */
export function HelpLink({ topic }: { topic?: HelpTopic }) {
    return (
        <a
            href={topic ? helpUrl(topic) : HELP_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Help centre (opens in a new tab)"
            title="Help"
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
            <CircleHelp className="size-5" />
        </a>
    );
}
