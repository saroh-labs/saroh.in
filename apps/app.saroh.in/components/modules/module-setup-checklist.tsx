import Link from "next/link";

import type { ModuleBlocker } from "@/lib/modules/schema";

/**
 * Renders a module's readiness/attention blockers as a short "what's left"
 * checklist. Each item shows the safe server-provided message and, when the
 * server supplied one, a link to where the user resolves it. Renders nothing
 * when there are no blockers.
 */
export function ModuleSetupChecklist({
    blockers,
}: {
    blockers: ModuleBlocker[];
}) {
    if (blockers.length === 0) return null;
    return (
        <ul className="mt-3 space-y-2" aria-label="Setup steps">
            {blockers.map((blocker) => (
                <li
                    key={blocker.code}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                    <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                    />
                    <span>
                        {blocker.message ?? blocker.code}
                        {blocker.actionHref ? (
                            <>
                                {" — "}
                                <Link
                                    href={blocker.actionHref}
                                    className="font-medium underline underline-offset-2"
                                >
                                    Resolve
                                </Link>
                            </>
                        ) : null}
                    </span>
                </li>
            ))}
        </ul>
    );
}
