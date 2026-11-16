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
    shown = p.rows.length,
    change,
}: {
    p: AskAiWords["hero"]["panel"];
    stockOn: boolean;
    /** How many order rows have come in yet (the steps' player); stock follows the last. */
    shown?: number;
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
            {p.rows.slice(0, shown).map((r) => {
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
                            shown < p.rows.length &&
                                "motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in",
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
            {stockOn && shown >= p.rows.length ? (
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

/** How long each step's part of the conversation plays, in the player's ticks. */
export function askPlayTicks(
    p: AskAiWords["hero"]["panel"],
): [number, number, number, number] {
    return [24, p.q.length + 14, 46, 40];
}

/**
 * Ask AI's "How it works" (board "overdrive", #49): the hero's one question
 * played through the four steps in one panel. Step 1 taps the ready
 * question, step 2 types it, step 3 reads the parts of the business then
 * brings in the answer's rows, step 4 offers the card; confirmed, its
 * orders read Ready. At the last step, confirmed, it is the whole answer.
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
    const [, typeLen, readLen] = askPlayTicks(p);
    const { step, progress: at, confirmed } = view;
    const typed =
        step > 1
            ? p.q.length
            : step === 1
              ? Math.min(p.q.length, Math.round(at * typeLen))
              : 0;
    // Step 3: the parts light up in turn, then the rows come in one by one.
    const readTo = 18 / readLen;
    const read = step > 2 || (step === 2 && at >= readTo);
    const lit =
        step === 2 && !read
            ? Math.min(p.sources.length, Math.floor(at / (5 / readLen)) + 1)
            : p.sources.length;
    const rows =
        step > 2
            ? p.rows.length
            : step === 2
              ? Math.min(
                    p.rows.length,
                    Math.floor(((at - readTo) / (1 - readTo)) * p.rows.length),
                )
              : 0;
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
                                on={i === home.sugs.length - 1 && at > 0.6}
                            />
                        ))}
                    </div>
                    <p className="m-0 text-[13px] leading-snug text-muted-foreground">
                        {words.hint}
                    </p>
                </>
            ) : (
                <Asked>
                    {p.q.slice(0, typed)}
                    {typed < p.q.length ? (
                        <span
                            aria-hidden
                            className="ml-0.5 inline-block h-[1.1em] w-0.5 animate-pulse bg-brand-500 align-[-0.2em]"
                        />
                    ) : null}
                </Asked>
            )}
            {step >= 2 ? (
                <ReadFrom
                    sources={p.sources.slice(0, lit)}
                    label={read ? p.from : play.reading}
                    tail={read ? p.where : undefined}
                />
            ) : null}
            {read ? (
                <>
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
                        shown={rows}
                        change={
                            step === 3
                                ? {
                                      ids: p.card.orders,
                                      done: confirmed,
                                      label: play.ready,
                                  }
                                : undefined
                        }
                    />
                </>
            ) : null}
            {step === 3 ? (
                <ConfirmCard
                    head={confirmed ? play.done : p.card.head}
                    title={p.card.title}
                    kv={p.card.kv}
                    note={p.card.note}
                    done={confirmed}
                    buttons={confirmed ? [play.undo] : p.card.buttons}
                    onConfirm={view.confirm}
                />
            ) : null}
        </AskPanel>
    );
}
