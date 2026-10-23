import { asWords } from "@/lib/format";
import type { OverviewPanel, OverviewWebsite } from "@/lib/overview-words";

import { CardLink, OverviewCard } from "./overview-card";

/**
 * Website and payments (U3, R2): each site and whether it is published,
 * where it is live, and whether a payment provider is connected (yes or
 * no, never a key).
 */
export function SiteCard({
    organizationId,
    website,
}: {
    organizationId: string;
    website: OverviewPanel<OverviewWebsite>;
}) {
    return (
        <OverviewCard id="website" title="Website and payments" data={website}>
            {(w) => (
                <div className="grid gap-3 text-sm">
                    {w.sites.length === 0 ? (
                        <p className="text-muted-foreground">No website yet.</p>
                    ) : (
                        <ul className="grid gap-1.5">
                            {w.sites.map((site) => (
                                <li key={site.id} className="min-w-0">
                                    <span>{site.name}</span>
                                    <span className="text-muted-foreground">
                                        {" · "}
                                        {site.published
                                            ? "Published"
                                            : "Not published"}
                                    </span>
                                    {site.addresses[0] && (
                                        <span className="block break-all font-mono text-[12.5px] text-muted-foreground">
                                            {site.addresses[0].url.replace(
                                                /^https?:\/\//,
                                                "",
                                            )}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p>
                        {w.payments.length === 0
                            ? "Payments: not connected"
                            : w.payments
                                  .map(
                                      (p) =>
                                          `${asWords(p.provider)}: ${
                                              p.needsAttention
                                                  ? "needs attention"
                                                  : p.connected
                                                    ? "connected"
                                                    : "not connected"
                                          }`,
                                  )
                                  .join(" · ")}
                    </p>
                    <CardLink organizationId={organizationId} tab="website">
                        Open Website and payments
                    </CardLink>
                </div>
            )}
        </OverviewCard>
    );
}
