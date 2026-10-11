import { Panel } from "@/components/panel";
import type { BusinessView } from "@/lib/businesses";
import {
    DATA_KEPT_MEANS,
    dataKeptLine,
    formatMinor,
    refundStage,
    trailDetail,
    trailTitle,
} from "@/lib/deletion-words";
import { formatDateTime } from "@/lib/format";
import { providerName } from "@/lib/what-they-see";

/**
 * A business's way out on its page (#921, owner 9 Oct): the refunds its
 * deletion waits on, and the deletion trail from the admin ledger. Each
 * shows only when there is something to show; neither offers a write.
 * A deleted business's trail opens with how long its data is kept
 * ("Data kept until ‹date›", DEC-122).
 */
export function DeletionPanels({
    view,
    now = new Date(),
}: {
    view: BusinessView;
    now?: Date;
}) {
    const { facts } = view;
    const refunds = view.deletionRefunds;
    const trail = view.deletionTrail;
    const pastWindow =
        facts.deletionScheduledAt !== null &&
        new Date(facts.deletionScheduledAt).getTime() <= now.getTime();
    const showRefunds =
        refunds !== undefined &&
        (refunds.status === "failed" || refunds.data.length > 0);
    const kept = dataKeptLine(facts);
    const showTrail =
        trail !== undefined &&
        (trail.status === "failed" || trail.data.length > 0 || kept !== null);

    return (
        <>
            {showRefunds && (
                <Panel
                    title={
                        pastWindow
                            ? "Deletion waiting on refunds"
                            : "Refunds still owed"
                    }
                    description={
                        pastWindow
                            ? "Its window has ended, but its customers are still owed these. It stays scheduled, with its payment keys, until each is settled; the daily run checks again."
                            : "It won't be deleted while its customers are owed any of these. Its people see the same list."
                    }
                    data={refunds}
                >
                    {(rows) => (
                        <ul className="grid gap-3">
                            {rows.map((r) => (
                                <li key={r.key} className="grid gap-0.5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <span className="text-sm font-medium">
                                            {r.paper ?? "A refund"} ·{" "}
                                            {formatMinor(
                                                r.amountMinor,
                                                r.currency,
                                            )}
                                        </span>
                                        <span className="text-[12.5px] text-muted-foreground">
                                            {refundStage(r.stage)}
                                        </span>
                                    </div>
                                    <p className="break-words text-[13px] text-muted-foreground">
                                        {[
                                            r.customer ?? "Customer hidden",
                                            r.provider
                                                ? providerName(r.provider)
                                                : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        {r.providerRef ? (
                                            <>
                                                {" · "}
                                                <span className="font-mono text-[12px]">
                                                    {r.providerRef}
                                                </span>
                                            </>
                                        ) : null}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            )}

            {showTrail && (
                <Panel
                    title="Deletion trail"
                    description="Each step of its deletion, newest first, from the ledger. Provider calls are in the API log as deletion_provider_call lines."
                    data={trail}
                >
                    {(rows) => (
                        <ol className="grid gap-3">
                            {kept !== null && (
                                <li
                                    className="grid gap-0.5 rounded-lg border px-3 py-2"
                                    data-testid="data-kept"
                                >
                                    <span className="text-sm font-medium">
                                        {kept}
                                    </span>
                                    <p className="text-[13px] text-muted-foreground">
                                        {DATA_KEPT_MEANS}
                                    </p>
                                </li>
                            )}
                            {rows.map((row) => (
                                <li key={row.id} className="grid gap-0.5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <span className="text-sm font-medium">
                                            {trailTitle(row)}
                                        </span>
                                        <time
                                            dateTime={row.createdAt}
                                            className="font-mono text-[12px] text-muted-foreground"
                                        >
                                            {formatDateTime(row.createdAt)}
                                        </time>
                                    </div>
                                    <p className="break-words text-[13px] text-muted-foreground">
                                        {trailDetail(row)}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    )}
                </Panel>
            )}
        </>
    );
}
