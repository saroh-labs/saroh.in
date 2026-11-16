import { cn } from "../../cn";
import type { PlayerView } from "../../sections/steps-player";
import { Asked, AskPanel, ConfirmCard, ReadFrom, Suggestion } from "./panel";
import type { AskAiWords } from "./words";

export const ROW =
    "grid items-center gap-3 border-t border-mk-line-row px-3.5 text-[14px] first:border-t-0";

/** The rows behind the hero's answer: today's orders, then the stock they need. */
export function AnswerTable({
    p,
    stockOn,
    change,
}: {
    p: AskAiWords["hero"]["panel"];
    stockOn: boolean;
    /** The card's orders: tinted while it waits, `label` (Ready) once done. */
    change?: { ids: readonly string[]; done: boolean; label: string };
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
            {p.rows.map((r) => {
                const changing = change?.ids.includes(r.id);
                const ready = changing && change?.done;
                return (
                    <div
                        key={r.id}
                        data-wire={r.from ? "p-ord" : undefined}
                        className={cn(
                            ROW,
                            "min-h-10 grid-cols-[70px_1fr_64px_70px] transition-colors duration-300 motion-reduce:transition-none",
                            change
                                ? changing && !ready && "bg-mk-tint"
                                : r.from && "bg-mk-tint",
                        )}
                    >
                        <span>{r.id}</span>
                        <span className="truncate">{r.customer}</span>
                        <span className="text-right">{r.total}</span>
                        <span
                            className={cn(
                                "text-right",
                                ready
                                    ? "font-semibold text-mk-ok"
                                    : r.paid !== "Paid" &&
                                          "font-semibold text-mk-warn",
                            )}
                        >
                            {ready ? change.label : r.paid}
                        </span>
                    </div>
                );
            })}
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

/** The words the steps' player draws: plain data, handed from the server page. */
export interface AskPlayWords {
    panel: AskAiWords["hero"]["panel"];
    /** Home's ready questions and their lead. */
    home: {
        lead: string;
        sugs: readonly { t: string; h?: string; act?: boolean }[];
    };
    hint: string;
    play: AskAiWords["inTheApp"]["play"];
}

/** The player's words from the page's: Home's screen is the one with a lead. */
export function askPlayWords(w: AskAiWords): AskPlayWords {
    const home = w.where.screens.find((sc) => sc.lead !== undefined);
    return {
        panel: w.hero.panel,
        home: { lead: home?.lead ?? "", sugs: home?.sugs ?? [] },
        hint: w.where.hintHome,
        play: w.inTheApp.play,
    };
}

/**
 * Ask AI's "How it works" (board "overdrive", #49, hands-on): the hero's one
 * question in one panel, moved on by the visitor. Step 1 shows Home's ready
 * questions with the last one inviting a tap; tapping it asks (step 2, a
 * short "Reading" beat), then the answer, its rows and the card (step 3);
 * pressing the card's button marks its orders Ready (step 4, confirmed).
 */
export function AskPlay({
    words,
    view,
    stockOn,
}: {
    words: AskPlayWords;
    view: PlayerView;
    stockOn: boolean;
}) {
    const { panel: p, home, play } = words;
    const { step, confirmed } = view;
    const lastHint = home.sugs.length - 1;
    return (
        <AskPanel title={p.title} icons={3} className="text-left">
            <span className="w-fit rounded-full bg-mk-hover px-2.5 py-1 text-[13px] font-semibold">
                {p.about}
            </span>
            {step === 0 ? (
                <>
                    <p className="m-0 font-display text-[22px] font-bold tracking-[-0.02em]">
                        {home.lead}
                    </p>
                    <div>
                        {home.sugs.map((g, i) => (
                            <Suggestion
                                key={g.t}
                                {...g}
                                onPick={
                                    i === lastHint
                                        ? () => view.go(2, 1)
                                        : undefined
                                }
                            />
                        ))}
                    </div>
                    <p className="m-0 text-[13px] leading-snug text-muted-foreground">
                        {words.hint}
                    </p>
                </>
            ) : (
                <>
                    <Asked>{p.q}</Asked>
                    <ReadFrom
                        sources={p.sources}
                        label={step === 1 ? play.reading : p.from}
                        tail={step === 1 ? undefined : p.where}
                        className={cn(
                            step === 1 && "motion-safe:animate-pulse",
                        )}
                    />
                </>
            )}
            {step >= 2 ? (
                <div className="grid gap-3.5 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in">
                    <div className="grid gap-1.5">
                        <p className="m-0 font-display text-[19px] font-bold leading-snug tracking-[-0.01em]">
                            {p.lead}
                        </p>
                        <p className="m-0 text-[15px] leading-normal text-mk-copy">
                            {p.why}
                        </p>
                    </div>
                    <AnswerTable
                        p={p}
                        stockOn={stockOn}
                        change={{
                            ids: p.card.orders,
                            done: confirmed,
                            label: play.ready,
                        }}
                    />
                    <ConfirmCard
                        head={confirmed ? play.done : p.card.head}
                        title={p.card.title}
                        kv={p.card.kv}
                        note={p.card.note}
                        done={confirmed}
                        buttons={confirmed ? [play.undo] : p.card.buttons}
                        onConfirm={view.confirm}
                    />
                </div>
            ) : null}
        </AskPanel>
    );
}
