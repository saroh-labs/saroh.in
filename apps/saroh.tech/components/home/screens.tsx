import { buttonClass } from "@/components/shared/button";

const HINT = "text-[13px] text-quiet";
const ROW = "flex items-center justify-between gap-3 border-t border-black/10";
const PILL =
    "whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold";
const DONE = `${PILL} bg-[#E7F0E6] text-[#24502A]`;

/** The product, drawn as markup with invented data. A picture to a screen reader. */
export function ClientPageScreen() {
    return (
        <div
            role="img"
            aria-label="A client page on saroh.app showing an accepted quote, an invoice due and a pay button"
            className="overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_30px_60px_-30px_rgba(28,28,26,.35)]"
        >
            <div className="flex items-center gap-2 px-[18px] pt-[18px] md:border-b md:border-black/10 md:py-3">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="hidden size-[9px] rounded-full bg-[#D9D5CC] md:block"
                    />
                ))}
                <span className={`font-mono md:ml-2.5 ${HINT}`}>
                    saroh.app/lumen/northwind
                </span>
            </div>
            <div className="flex flex-col gap-3.5 p-[18px] md:gap-[18px] md:px-7 md:py-[26px]">
                <div className="flex items-center justify-between">
                    <div>
                        <div className={HINT}>Lumen Studio · for</div>
                        <div className="font-display text-[22px] font-bold tracking-[-0.03em] md:text-[26px]">
                            Northwind Supply
                        </div>
                    </div>
                    <div className="hidden size-11 rounded-[10px] border border-line bg-paper md:block" />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-ink p-3.5 md:px-[18px] md:py-4">
                    <div>
                        <div className={HINT}>
                            <span className="hidden md:inline">Invoice </span>
                            INV-0007 · due 31 Dec
                        </div>
                        <div className="font-mono text-xl font-medium md:text-[26px]">
                            £2,736.00
                        </div>
                    </div>
                    <span
                        className={buttonClass(
                            "primary",
                            "!h-11 !px-3.5 !text-sm md:!px-6 md:!text-[15px]",
                        )}
                    >
                        Pay now
                    </span>
                </div>
                <div className="flex flex-col text-sm md:text-[14.5px]">
                    <div className={`${ROW} py-2.5 md:py-[11px]`}>
                        <span>
                            Quote Q-0005
                            <span className="hidden md:inline">
                                {" "}
                                · Brand and website
                            </span>
                        </span>
                        <span className={DONE}>Accepted 14 Nov</span>
                    </div>
                    <div className={`${ROW} py-2.5 md:py-[11px]`}>
                        <span>Deposit · 30%</span>
                        <span className={DONE}>Paid 15 Nov</span>
                    </div>
                    <div className={`${ROW} hidden py-[11px] md:flex`}>
                        <span>Homepage design</span>
                        <span className={`${PILL} bg-[#EAE6DE] text-body`}>
                            Waiting for your OK
                        </span>
                    </div>
                    <div className={`${ROW} hidden py-[11px] md:flex`}>
                        <span>Progress note · 28 Nov</span>
                        <span className={HINT}>Read</span>
                    </div>
                </div>
                <span className={`hidden md:inline ${HINT}`}>
                    Pays through Lumen Studio&apos;s own PayPal. No login
                    needed.
                </span>
            </div>
        </div>
    );
}

const OVERDUE = [
    { who: "Jordan Lee", inv: "INV-0042", late: 12, amount: "$850.00" },
    { who: "Ava Thompson", inv: "INV-0031", late: 5, amount: "A$360.00" },
    { who: "Sam Carter", inv: "INV-0040", late: 2, amount: "$370.00" },
];

export function OverdueScreen() {
    return (
        <div
            role="img"
            aria-label="List of overdue invoices with a remind button on each"
            className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-[18px] md:gap-3.5 md:p-6"
        >
            <div className="hidden justify-between md:flex">
                <b>Overdue</b>
                <span className={HINT}>3 need you</span>
            </div>
            {OVERDUE.map((o, i) => (
                <div
                    key={o.inv}
                    className={`flex items-center justify-between gap-4 border-t border-black/10 pt-2.5 first:border-t-0 first:pt-0 md:grid md:grid-cols-[minmax(0,1fr)_110px_auto] md:pt-3 md:first:border-t md:first:pt-3 ${i === 2 ? "!hidden md:!grid" : ""}`}
                >
                    <span>
                        {o.who}
                        <span className="hidden md:inline"> · {o.inv}</span>
                        <br />
                        <span className={HINT}>
                            <span className="md:hidden">{o.amount} · </span>
                            {o.late} days late
                        </span>
                    </span>
                    <span className="hidden text-right font-mono md:block">
                        {o.amount}
                    </span>
                    <span className={buttonClass("compact", "shrink-0")}>
                        Remind
                    </span>
                </div>
            ))}
        </div>
    );
}
