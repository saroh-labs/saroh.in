import { Card } from "@saroh/ui/card";
import { ChevronDown } from "lucide-react";

/**
 * The site's verification codes (DEC-108, U7) as one row that opens: the
 * Google, Bing (and, with a domain of the business's own, Meta and
 * Pinterest) fields are what most shops set once and never again, so they
 * fold behind a line that says how many are added. A native `details`, so
 * it opens from the keyboard and the fields stay in the page while closed.
 *
 * "Verification codes", not "Search console codes": Meta and Pinterest
 * are here too, and neither is a search console.
 */
export function VerificationCodes({
    services,
    added,
    children,
}: {
    /** The services offered, by key ("google", "bing", …). */
    services: readonly string[];
    /** How many codes are saved. */
    added: number;
    children: React.ReactNode;
}) {
    return (
        <Card className="wk-surface" data-verification-codes>
            <details className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl px-4 py-3 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                    <h3 className="text-sm font-medium">Verification codes</h3>
                    <ChevronDown
                        aria-hidden
                        className="row-span-2 size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-open:rotate-180"
                    />
                    <span className="text-sm text-muted-foreground">
                        Prove the site is yours to {servicesLine(services)}.{" "}
                        {addedLine(added)}
                    </span>
                </summary>
                <div className="divide-y divide-border border-t border-border">
                    {children}
                </div>
            </details>
        </Card>
    );
}

/** Each service by the name an owner knows it by. */
const SERVICE_NAMES: Record<string, string> = {
    google: "Google",
    bing: "Bing",
    meta: "Meta",
    pinterest: "Pinterest",
};

/** "Google, Bing, Meta and Pinterest". */
export function servicesLine(services: readonly string[]): string {
    const labels = services.map((s) => SERVICE_NAMES[s] ?? s);
    if (labels.length <= 1) return labels.join("");
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "None added", "1 added", "2 added". */
export function addedLine(added: number): string {
    return added === 0 ? "None added" : `${added} added`;
}
