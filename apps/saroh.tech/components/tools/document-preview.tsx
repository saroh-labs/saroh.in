import type { DocumentView } from "@/lib/tools/document";

/** The document as it will print: the same words the PDF draws. */
export function DocumentPreview({ view }: { view: DocumentView }) {
    const compact = view.style === "compact";
    const bold = view.style === "bold";
    return (
        <div
            data-print
            className={`flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface text-[13px] leading-normal shadow-[0_18px_40px_-18px_rgba(28,28,26,.28)] [overflow-wrap:anywhere] ${
                compact ? "gap-3 p-6" : "gap-[22px] p-5 md:p-10 md:pb-9"
            } ${bold ? "!pt-0" : ""}`}
        >
            <div
                className={`flex justify-between gap-4 ${
                    bold
                        ? "-mx-5 bg-ink px-5 py-6 text-paper md:-mx-10 md:px-10"
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
                        className="size-12 rounded-control object-contain"
                    />
                ) : (
                    <span />
                )}
                <div className="text-right">
                    <div className="font-display text-[26px] font-bold tracking-[-0.03em]">
                        {view.heading}
                    </div>
                    <div
                        className={`font-mono ${bold ? "text-[#D8D5CC]" : "text-quiet"}`}
                    >
                        {view.number}
                    </div>
                    {view.stamp ? (
                        <span className="mt-1 inline-block rounded-full bg-[#F7E8D2] px-2.5 py-0.5 text-xs font-bold text-saffron-text">
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
                        <tr className="border-b border-ink text-left">
                            <th scope="col" className="py-2 font-semibold">
                                Description
                            </th>
                            <th scope="col" className="w-10 py-2 font-semibold">
                                Qty
                            </th>
                            <th
                                scope="col"
                                className="w-20 py-2 text-right font-semibold"
                            >
                                Rate
                            </th>
                            <th
                                scope="col"
                                className="w-[90px] py-2 text-right font-semibold"
                            >
                                Amount
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.rows.map((r, i) => (
                            <tr key={i} className="border-b border-line">
                                <td className="py-2 pr-2">{r.description}</td>
                                <td className="py-2">{r.qty}</td>
                                <td className="py-2 text-right font-mono">
                                    {r.rate}
                                </td>
                                <td className="py-2 text-right font-mono">
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
                            <span className="font-mono">{e.amount}</span>
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
                                ? "border-t border-ink pt-1.5 text-base font-bold"
                                : ""
                        }`}
                    >
                        <span>{t.label}</span>
                        <span className="font-mono">{t.value}</span>
                    </div>
                ))}
            </div>

            {view.blocks.map((b, i) => (
                <div
                    key={i}
                    className="whitespace-pre-line border-t border-line pt-3"
                >
                    {b.label ? <b className="block">{b.label}</b> : null}
                    {b.lines.map((l, j) => (
                        <div key={j}>{l}</div>
                    ))}
                </div>
            ))}

            {view.signLine ? (
                <div className="grid grid-cols-[2fr_1fr] gap-6 pt-8 text-quiet">
                    <div className="border-t border-ink pt-1">
                        Client signature
                    </div>
                    <div className="border-t border-ink pt-1">Date</div>
                </div>
            ) : null}
        </div>
    );
}
