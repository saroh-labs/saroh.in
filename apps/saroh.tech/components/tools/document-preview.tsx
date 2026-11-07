import type { DocumentView } from "@/lib/tools/document";

/** The document as it will print: the same words the PDF draws. */
export function DocumentPreview({ view }: { view: DocumentView }) {
    const compact = view.style === "compact";
    const bold = view.style === "bold";
    const rateHeader = view.headers ? view.headers.rate : "Rate";
    return (
        <div
            data-print
            className={`flex flex-col overflow-hidden rounded-mk-card border border-border bg-card text-[13px] leading-normal shadow-mk-card [overflow-wrap:anywhere] ${
                compact ? "gap-3 p-6" : "gap-[22px] p-5 md:p-10 md:pb-9"
            } ${bold ? "!pt-0" : ""}`}
        >
            <div
                className={`flex justify-between gap-4 ${
                    bold
                        ? "-mx-5 bg-foreground px-5 py-6 text-background md:-mx-10 md:px-10"
                        : ""
                }`}
            >
                {view.logo ? (
                    // A data URL from this browser: nothing for an optimiser to do.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={view.logo}
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 rounded-mk-control object-contain"
                    />
                ) : (
                    <span />
                )}
                <div className="text-right">
                    <div className="font-display text-[26px] font-bold tracking-[-0.03em]">
                        {view.heading}
                    </div>
                    <div
                        className={`font-mono ${bold ? "text-mk-on-ink" : "text-muted-foreground"}`}
                    >
                        {view.number}
                    </div>
                    {view.stamp ? (
                        <span className="mt-1 inline-block rounded-full bg-mk-soon px-2.5 py-0.5 text-xs font-bold text-brand-700">
                            {view.stamp}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.9fr)]">
                {view.parties.map((p) => (
                    <div key={p.label}>
                        <b>{p.label}</b>
                        {p.lines.map((l) => (
                            <div key={l}>{l}</div>
                        ))}
                    </div>
                ))}
                {view.facts.length ? (
                    <div className="col-span-2 md:col-span-1">
                        {view.facts.map((f) => (
                            <div key={f.label}>
                                <b>{f.label}</b> {f.value}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>

            {view.rows.length ? (
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b border-foreground text-left">
                            <th scope="col" className="py-2 pr-2 font-semibold">
                                Description
                            </th>
                            <th
                                scope="col"
                                className={`py-2 pr-2 font-semibold ${view.headers ? "w-16 sm:w-24" : "w-10"}`}
                            >
                                {view.headers?.qty ?? "Qty"}
                            </th>
                            {rateHeader ? (
                                <th
                                    scope="col"
                                    className="w-16 py-2 pl-2 text-right font-semibold sm:w-20"
                                >
                                    {rateHeader}
                                </th>
                            ) : null}
                            <th
                                scope="col"
                                className="w-[76px] py-2 pl-2 text-right font-semibold sm:w-[90px]"
                            >
                                {view.headers?.amount ?? "Amount"}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.rows.map((r, i) => (
                            <tr key={i} className="border-b border-border">
                                <td className="py-2 pr-2">{r.description}</td>
                                <td className="py-2 pr-2">{r.qty}</td>
                                {rateHeader ? (
                                    <td className="py-2 pl-2 text-right font-mono">
                                        {r.rate}
                                    </td>
                                ) : null}
                                <td className="py-2 pl-2 text-right font-mono">
                                    {r.amount}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : null}

            {view.extras.length ? (
                <div>
                    <b>Optional extras (not in the total)</b>
                    {view.extras.map((e, i) => (
                        <div key={i} className="flex justify-between gap-4">
                            <span>{e.description}</span>
                            <span className="whitespace-nowrap font-mono">
                                {e.amount}
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="flex w-full max-w-60 flex-col gap-1 self-end">
                {view.totals.map((t) => (
                    <div
                        key={t.label}
                        className={`flex justify-between gap-3 ${
                            t.strong
                                ? "border-t border-foreground pt-1.5 text-base font-bold"
                                : ""
                        }`}
                    >
                        <span>{t.label}</span>
                        <span className="whitespace-nowrap font-mono">
                            {t.value}
                        </span>
                    </div>
                ))}
            </div>

            {view.blocks.map((b, i) => (
                <div
                    key={i}
                    className="whitespace-pre-line border-t border-border pt-3"
                >
                    {b.label ? <b className="block">{b.label}</b> : null}
                    {b.lines.map((l, j) => (
                        <div key={j}>{l}</div>
                    ))}
                </div>
            ))}

            {view.signLine ? (
                <div className="grid grid-cols-[2fr_1fr] gap-6 pt-8 text-muted-foreground">
                    <div className="border-t border-foreground pt-1">
                        Client signature
                    </div>
                    <div className="border-t border-foreground pt-1">Date</div>
                </div>
            ) : null}
        </div>
    );
}
