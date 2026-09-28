/**
 * Pack Detail's Customer view (E16, the design's lens): how the pack shows
 * to someone booking with nothing left — its name, terms and price. A
 * picture of the offer in Saroh's own tokens, not the merchant's site.
 */
export function CustomerView({
    name,
    note,
    line,
    price,
}: {
    name: string;
    note: string;
    line: string;
    price: string;
}) {
    return (
        <div className="grid max-w-[560px] gap-3 p-[22px] max-[759px]:px-4">
            <p className="m-0 text-[12.5px] text-muted-foreground">{note}</p>
            <div className="rounded-[16px] border border-border bg-card px-5 py-[18px] text-card-foreground shadow-xs">
                <div className="font-display text-[18px] font-semibold">
                    Buy a pack and use 1 now
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-highlight-border bg-brand-subtle px-3.5 py-3 shadow-[inset_3px_0_0_hsl(var(--highlight))]">
                    <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">
                            {name}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-foreground/80">
                            {line}
                        </span>
                    </span>
                    <span className="font-display text-[16px] font-semibold tabular-nums">
                        {price}
                    </span>
                </div>
            </div>
        </div>
    );
}
