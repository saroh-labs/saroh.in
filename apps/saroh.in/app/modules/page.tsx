import type { Metadata } from "next";
import Link from "next/link";

import { ModuleTable } from "@/components/site/module-table";
import { ProductShot } from "@/components/site/product-shot";
import { DEPENDENT_MODULES, LABEL_BY_KEY } from "@/lib/modules";

export const metadata: Metadata = {
    title: "Modules — Saroh",
    description:
        "Eight capability modules with real dependencies: website, commerce, appointments, CRM, payments, communications, automations and insights.",
};

export default function ModulesIndexPage() {
    return (
        <>
            <section className="border-b border-border py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <h1 className="mt-3.5 max-w-[22ch] font-display text-[clamp(2.125rem,4.4vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.035em]">
                        Eight capabilities. Switch on what you need.
                    </h1>
                    <p className="mt-5 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
                        Each one is a real module in the product&rsquo;s
                        registry, with real dependencies between them. Turning a
                        module off never deletes what it held.
                    </p>

                    <ModuleTable />
                </div>
            </section>

            <section className="py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <h2 className="mt-3.5 max-w-[24ch] font-display text-[clamp(1.5rem,2.8vw,2rem)] font-semibold leading-[1.14] tracking-[-0.03em]">
                        Three modules need another one before they can run.
                    </h2>
                    <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                        {DEPENDENT_MODULES.map((m) => (
                            <li key={m.key} className="bg-background p-6">
                                <Link
                                    href={`/modules/${m.slug}`}
                                    className="text-[15.5px] font-semibold tracking-[-0.01em] transition-colors hover:text-brand"
                                >
                                    {m.label}
                                </Link>
                                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                                    {m.blurb}
                                </p>
                                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-brand">
                                    Requires{" "}
                                    {m.needs
                                        ?.map((k) => LABEL_BY_KEY.get(k) ?? k)
                                        .join(" · ")}
                                </p>
                            </li>
                        ))}
                    </ul>

                    <ProductShot
                        name="modules"
                        alt="The Modules settings screen"
                        caption="Settings → Modules"
                    />
                </div>
            </section>
        </>
    );
}
