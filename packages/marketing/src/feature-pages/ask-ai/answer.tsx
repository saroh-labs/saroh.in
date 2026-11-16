import { cn } from "../../cn";
import {
    Asked,
    AskPanel,
    Checked,
    ConfirmCard,
    ReadFrom,
    Suggestion,
} from "./panel";
import type { AskAiWords } from "./words";

export const ROW =
    "grid items-center gap-3 border-t border-mk-line-row px-3.5 text-[14px] first:border-t-0";

/** The rows behind the hero's answer: today's orders, then the stock they need. */
export function AnswerTable({
    p,
    stockOn,
}: {
    p: AskAiWords["hero"]["panel"];
    stockOn: boolean;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border text-[14px]">
            <div
                className={cn(
                    ROW,
                    "min-h-8 grid-cols-[70px_1fr_64px_70px] bg-mk-noon text-[12.5px] font-semibold text-muted-foreground",
                )}
            >
                {p.head.map((x, i) => (
                    <span key={x} className={cn(i > 1 && "text-right")}>
                        {x}
                    </span>
                ))}
            </div>
            {p.rows.map((r) => (
                <div
                    key={r.id}
                    data-wire={r.from ? "p-ord" : undefined}
                    className={cn(
                        ROW,
                        "min-h-10 grid-cols-[70px_1fr_64px_70px]",
                        r.from && "bg-mk-tint",
                    )}
                >
                    <span>{r.id}</span>
                    <span className="truncate">{r.customer}</span>
                    <span className="text-right">{r.total}</span>
                    <span
                        className={cn(
                            "text-right",
                            r.paid !== "Paid" && "font-semibold text-mk-warn",
                        )}
                    >
                        {r.paid}
                    </span>
                </div>
            ))}
            {stockOn ? (
                <>
                    <div
                        className={cn(
                            ROW,
                            "min-h-8 grid-cols-[1fr_64px_70px] border-t border-mk-line-row bg-mk-noon text-[12px] font-semibold text-muted-foreground",
                        )}
                    >
                        {p.stockHead.map((x, i) => (
                            <span key={x} className={cn(i > 0 && "text-right")}>
                                {x}
                            </span>
                        ))}
                    </div>
                    {p.stockRows.map((r, i) => (
                        <div
                            key={r.name}
                            data-wire={i === 0 ? "p-stk" : undefined}
                            className={cn(
                                ROW,
                                "min-h-10 grid-cols-[1fr_64px_70px] bg-mk-tint",
                            )}
                        >
                            <span>{r.name}</span>
                            <span className="text-right">{r.need}</span>
                            <span className="text-right">{r.have}</span>
                        </div>
                    ))}
                </>
            ) : null}
        </div>
    );
}

/**
 * Ask AI's "How it works" steps, drawn (board "Steps A"): the captures are
 * phone-narrow and unreadable at the panel's size, and saroh.tech has none.
 * Each follows the hero's one question, keyed by the step's shot.
 */
export function AskStep({
    w,
    shot,
    stockOn,
}: {
    w: AskAiWords;
    shot: string;
    stockOn: boolean;
}) {
    const p = w.hero.panel;
    const home = w.where.screens.find((sc) => sc.lead !== undefined);
    return (
        <AskPanel
            title={p.title}
            icons={3}
            className="mx-auto max-w-[560px] text-left"
        >
            {shot === "ask-start" && home?.lead ? (
                <>
                    <p className="m-0 text-[16px] font-semibold">{home.lead}</p>
                    <div>
                        {home.sugs.map((g) => (
                            <Suggestion key={g.t} {...g} />
                        ))}
                    </div>
                    <p className="m-0 text-[13px] leading-snug text-muted-foreground">
                        {w.where.hintHome}
                    </p>
                </>
            ) : (
                <>
                    <span className="w-fit rounded-full bg-mk-hover px-2.5 py-1 text-[13px] font-semibold">
                        {p.about}
                    </span>
                    <Asked>{p.q}</Asked>
                    <Checked>{p.checked}</Checked>
                    {shot === "ask-answer" ? (
                        <>
                            <p className="m-0 text-[17px] font-semibold leading-snug">
                                {p.lead}
                            </p>
                            <AnswerTable p={p} stockOn={stockOn} />
                            <ReadFrom
                                sources={p.sources}
                                label={p.from}
                                tail={p.where}
                            />
                        </>
                    ) : shot === "ask-confirm" ? (
                        <>
                            <p className="m-0 text-[15px] leading-normal text-mk-copy">
                                {p.lead}
                            </p>
                            <ConfirmCard {...p.card} />
                        </>
                    ) : null}
                </>
            )}
        </AskPanel>
    );
}
