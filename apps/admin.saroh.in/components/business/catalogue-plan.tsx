import { formatInr } from "@saroh/pricing-catalog";
import { Badge } from "@saroh/ui/badge";

import type {
    BusinessCatalogue,
    BusinessOverride,
    BusinessPlan,
    CatalogueModuleRow,
} from "@/lib/businesses";
import { asWords, camelToWords, formatDate } from "@/lib/format";
import { overrideKindWords } from "@/lib/overrides";

import { Facts } from "../panel";
import { RemoveOverride } from "./catalogue-actions";
import { RevokeLimit } from "./plan-actions";

const STATE_WORDS: Record<CatalogueModuleRow["state"], string> = {
    on: "On",
    locked: "Locked",
    hidden: "Hidden",
};

function cell(
    state: CatalogueModuleRow["state"],
    limit: number | null,
    per: string,
) {
    if (state !== "on") return STATE_WORDS[state];
    if (limit === null) return "On";
    return `${limit.toLocaleString("en-IN")}${per ? ` a ${per}` : ""}`;
}

/**
 * The business read through the pricing catalogue (pricing U11): which plan
 * and version it is on and why, what it pays, a move ahead of it, every
 * catalogue row as its plan gives it and as it gets it now, and the live
 * overrides that make the difference.
 */
export function CataloguePlan({
    organizationId,
    plan,
    catalogue,
    canOverride,
    canSetPrice,
    canRaise,
}: {
    organizationId: string;
    plan: BusinessPlan;
    catalogue: BusinessCatalogue;
    canOverride: boolean;
    canSetPrice: boolean;
    /** `subscription:override`: a raised limit is ended from here too. */
    canRaise: boolean;
}) {
    const planName = (id: string) =>
        catalogue.plans.find((p) => p.id === id)?.name ?? id;
    const live = catalogue.liveVersion;
    const sub = plan.subscription;

    return (
        <div className="grid gap-4">
            <Facts
                rows={[
                    [
                        "Plan",
                        catalogue.planOverride
                            ? `${catalogue.planName} until ${formatDate(catalogue.planOverride.expiresAt)}, then ${planName(catalogue.basePlanId)}`
                            : catalogue.planName,
                    ],
                    [
                        "Version",
                        live === null || live === catalogue.version
                            ? `${catalogue.version} (live)`
                            : `${catalogue.version} · live is ${live}`,
                    ],
                    [
                        "Price a month",
                        catalogue.pricePaise === catalogue.planPricePaise
                            ? `${formatInr(catalogue.pricePaise)} before GST`
                            : `${formatInr(catalogue.pricePaise)} before GST (custom; plan ${formatInr(catalogue.planPricePaise)})`,
                    ],
                    [
                        "Billing",
                        sub
                            ? `${asWords(sub.status)}${sub.provider ? ` · through ${sub.provider}` : ""}${sub.plan.interval === "year" ? " · yearly" : ""}`
                            : "No subscription",
                    ],
                    [
                        sub?.status === "TRIALING"
                            ? "Trial ends"
                            : "Period ends",
                        formatDate(sub?.currentPeriodEnd),
                    ],
                    ...(catalogue.pendingMove
                        ? ([
                              [
                                  "Moving",
                                  `To ${planName(catalogue.pendingMove.planId)}, version ${catalogue.pendingMove.version}, on ${formatDate(catalogue.pendingMove.from)}`,
                              ],
                          ] as [string, string][])
                        : []),
                ]}
            />

            <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                    <thead>
                        <tr className="border-b text-left text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                            <th className="py-2 pr-3 font-semibold">Module</th>
                            <th className="py-2 pr-3 font-semibold">
                                Plan gives
                            </th>
                            <th className="py-2 pr-3 font-semibold">Now</th>
                            <th className="py-2 text-right font-semibold">
                                In use
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {catalogue.modules.map((m) => {
                            const over =
                                m.state === "on" &&
                                m.limit !== null &&
                                m.usage !== null &&
                                m.usage > m.limit;
                            return (
                                <tr
                                    key={m.moduleId}
                                    className="border-b align-top last:border-0"
                                >
                                    <td className="py-2 pr-3 font-medium">
                                        {m.name}
                                    </td>
                                    <td className="py-2 pr-3 text-muted-foreground">
                                        {cell(m.planState, m.planLimit, m.per)}
                                    </td>
                                    <td className="py-2 pr-3">
                                        {cell(m.state, m.limit, m.per)}
                                        {m.override && (
                                            <span className="block text-[12.5px] text-muted-foreground">
                                                {m.override}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">
                                        {m.usage ?? (
                                            <span className="text-muted-foreground">
                                                Not measured
                                            </span>
                                        )}
                                        {over && (
                                            <div className="mt-1 flex justify-end">
                                                <Badge variant="warning">
                                                    Over · read-only
                                                </Badge>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <OverrideList
                organizationId={organizationId}
                overrides={plan.overrides}
                describeTarget={(o) =>
                    o.kind === "plan"
                        ? planName(o.planKey ?? "")
                        : o.kind === "price"
                          ? formatInr(o.value ?? 0)
                          : (catalogue.modules.find(
                                (m) => m.moduleId === (o.moduleKey ?? o.key),
                            )?.name ?? camelToWords(o.key))
                }
                canRemove={(o) =>
                    o.kind === "raise"
                        ? canRaise
                        : o.kind === "price"
                          ? canSetPrice
                          : canOverride
                }
            />
        </div>
    );
}

function OverrideList({
    organizationId,
    overrides,
    describeTarget,
    canRemove,
}: {
    organizationId: string;
    overrides: BusinessOverride[];
    describeTarget: (o: BusinessOverride) => string;
    canRemove: (o: BusinessOverride) => boolean;
}) {
    if (overrides.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No overrides: it gets exactly what its plan gives.
            </p>
        );
    }
    return (
        <div className="grid gap-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Overrides
            </h3>
            <ul className="grid gap-1">
                {overrides.map((o) => {
                    const target = describeTarget(o);
                    const label = `${overrideKindWords(o.kind)}: ${target}`;
                    return (
                        <li
                            key={o.id}
                            className="flex min-w-0 items-start justify-between gap-3 rounded-lg px-2 py-1.5"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium">
                                    {label}
                                    {o.kind === "limit" || o.kind === "raise"
                                        ? ` → ${o.value ?? ""}`
                                        : ""}
                                </p>
                                <p className="break-words text-[12.5px] text-muted-foreground">
                                    {o.expiresAt
                                        ? `Until ${formatDate(o.expiresAt)}`
                                        : "Until removed"}{" "}
                                    · {o.reason}
                                </p>
                            </div>
                            {canRemove(o) &&
                                (o.kind === "raise" ? (
                                    o.expiresAt && (
                                        <RevokeLimit
                                            organizationId={organizationId}
                                            overrideId={o.id}
                                            label={target}
                                            expiresAt={o.expiresAt}
                                        />
                                    )
                                ) : (
                                    <RemoveOverride
                                        organizationId={organizationId}
                                        overrideId={o.id}
                                        label={label}
                                    />
                                ))}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
