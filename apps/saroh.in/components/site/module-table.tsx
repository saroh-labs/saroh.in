import Link from "next/link";

import { LABEL_BY_KEY, MODULES } from "@/lib/modules";

/**
 * The eight modules as a ruled table, not as eight marketing cards.
 *
 * This is the page's one real argument: the dependencies are enforced by the
 * product's module registry, so showing them as DATA — a column, a chip, a rule
 * between rows — is both more honest and more persuasive than a paragraph
 * claiming "everything works together". A card grid would flatten the three
 * modules that require CRM into the five that do not.
 */
export function ModuleTable() {
    return (
        <div className="mt-12 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1fr] gap-4 border-b border-border bg-muted/40 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:grid-cols-[170px_1fr_110px]">
                <span>Module</span>
                <span className="hidden sm:block">What it does</span>
                <span className="hidden text-right sm:block">Requires</span>
            </div>

            {MODULES.map((m) => (
                <Link
                    key={m.key}
                    href={`/modules/${m.slug}`}
                    className="group grid grid-cols-[1fr] items-center gap-1 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:-outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[170px_1fr_110px] sm:gap-4"
                >
                    <span className="text-[14.5px] font-medium group-hover:text-foreground">
                        {m.label}
                    </span>
                    <span className="text-[14px] text-muted-foreground">
                        {m.blurb}
                    </span>
                    <span className="sm:text-right">
                        {m.needs?.length ? (
                            <span className="inline-flex h-[22px] items-center rounded-md border border-brand/30 bg-brand/10 px-2 font-mono text-[11px] tracking-[0.06em] text-brand">
                                {m.needs
                                    .map((k) => LABEL_BY_KEY.get(k) ?? k)
                                    .join(" · ")}
                            </span>
                        ) : (
                            <span className="font-mono text-[11px] text-muted-foreground/60">
                                —
                            </span>
                        )}
                    </span>
                </Link>
            ))}
        </div>
    );
}
