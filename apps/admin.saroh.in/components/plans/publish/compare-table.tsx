"use client";

import type { Catalog } from "@saroh/pricing-catalog";

import { comparePlans } from "./compare";
import { PANEL } from "./impact-list";

/** "Live and draft, side by side": per plan, only the rows that differ. */
export function CompareTable({
    live,
    draft,
}: {
    live: Catalog | null;
    draft: Catalog;
}) {
    const plans = comparePlans(live, draft);
    return (
        <section aria-label="Live and draft side by side" className={PANEL}>
            <h2 className="font-display text-base font-semibold">
                Live and draft, side by side
            </h2>
            {plans.map((p) => (
                <div
                    key={p.planId}
                    className="grid gap-1.5 rounded-[10px] border border-border bg-card p-3"
                >
                    <div className="flex items-baseline gap-2">
                        <h3 className="font-semibold">{p.name}</h3>
                        <span className="text-[12px] text-muted-foreground">
                            {p.same}
                        </span>
                    </div>
                    <table className="w-full table-fixed border-collapse text-left text-[12.5px]">
                        <thead>
                            <tr className="text-[11px] font-normal">
                                <th scope="col" className="pb-1 font-normal">
                                    <span className="sr-only">Row</span>
                                </th>
                                <th
                                    scope="col"
                                    className="pb-1 font-normal text-muted-foreground"
                                >
                                    Live
                                </th>
                                <th
                                    scope="col"
                                    className="pb-1 font-normal text-highlight"
                                >
                                    Draft
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {p.lines.map((l) => (
                                <tr key={l.key}>
                                    <th
                                        scope="row"
                                        className="py-0.5 pr-2.5 align-top font-normal text-muted-foreground"
                                    >
                                        {l.key}
                                    </th>
                                    <td className="py-0.5 pr-2.5 align-top text-muted-foreground">
                                        {l.live}
                                    </td>
                                    <td className="py-0.5 align-top font-semibold">
                                        {l.draft}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </section>
    );
}
