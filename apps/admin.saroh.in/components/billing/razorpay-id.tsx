import { razorpayDashboardUrl } from "@/lib/billing-action-words";

/**
 * A billing provider's id: a link into Razorpay's dashboard when it is a
 * Razorpay id (DEC-166), plain text otherwise. Opens in a new tab and
 * sends nothing of the console with it.
 */
export function RazorpayId({
    id,
    provider = "RAZORPAY",
    className,
}: {
    id: string | null | undefined;
    provider?: string | null;
    className?: string;
}) {
    if (!id) return null;
    const href = razorpayDashboardUrl(id, provider);
    const style = `break-all font-mono text-[12px] ${className ?? ""}`.trim();
    if (!href) return <span className={style}>{id}</span>;
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${style} underline underline-offset-4`}
        >
            {id}
        </a>
    );
}

/** An action's or event's refs, each id beside what it is. */
export function RefList({
    refs,
    labelOf,
}: {
    refs: Record<string, string>;
    labelOf: (key: string) => string;
}) {
    const provider = "provider" in refs ? refs.provider : "RAZORPAY";
    const entries = Object.entries(refs).filter(([key]) => key !== "provider");
    if (entries.length === 0) return null;
    return (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {entries.map(([key, value]) => (
                <div key={key} className="flex min-w-0 gap-1.5">
                    <dt className="text-muted-foreground">{labelOf(key)}</dt>
                    <dd className="min-w-0">
                        <RazorpayId id={value} provider={provider} />
                    </dd>
                </div>
            ))}
        </dl>
    );
}
