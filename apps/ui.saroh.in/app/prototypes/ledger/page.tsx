import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";

/**
 * THE LEDGER ACROSS FOUR SCENES — a prototype for #172.
 *
 * Rough on purpose. This exists to be reacted to, not shipped: it answers the
 * five questions the ticket raises by making a choice visible, so the choice
 * can be argued with. Nothing here reads a database.
 *
 * Open it at https://ui.saroh.localhost/prototypes/ledger and look at it at
 * 320, 390 and 1440, in light and dark, with a mouse and with a touch pointer.
 */

interface Row {
    id: string;
    kind: "order" | "booking";
    /** Who the row is about, as recorded on THIS row. */
    who: string;
    /** What was sold, or what was booked. */
    what: string;
    /** For an order: units. For a booking: the slot. */
    detail: string;
    /** The instant that decides what happens next. See WHICH DATE below. */
    at: string;
    /** Relative phrasing of `at`, already resolved. */
    when: string;
    status: string;
    tone: "waiting" | "settled" | "attention";
    /**
     * Minor units. `null` means NO PRICE WAS SET — not zero, not free.
     * Question 3 of the ticket, and Decision 4.
     */
    amountMinor: number | null;
    currency: string | null;
    /**
     * Another row that looks like the same person but is NOT linked.
     * Question 4. Nothing here claims they are the same.
     */
    resemblesRowId?: string;
}

const ROWS: Row[] = [
    {
        id: "r1",
        kind: "order",
        who: "Ananya Rao",
        what: "Warehouse shelving",
        detail: "Chair × 2",
        at: "2026-09-01",
        when: "4 days waiting",
        status: "Unfulfilled",
        tone: "attention",
        amountMinor: 407_100,
        currency: "INR",
        resemblesRowId: "r3",
    },
    {
        id: "r2",
        kind: "booking",
        who: "Meera Iyer",
        what: "Warehouse walkthrough",
        detail: "Thu 6 Sept, 10:00",
        at: "2026-09-06",
        when: "in 1 day",
        status: "Confirmed",
        tone: "waiting",
        amountMinor: null,
        currency: null,
    },
    {
        id: "r3",
        kind: "booking",
        who: "A. Rao",
        what: "Product consultation",
        detail: "Mon 7 Sept, 15:00",
        at: "2026-09-07",
        when: "in 2 days",
        status: "Pending",
        tone: "attention",
        amountMinor: 150_000,
        currency: "INR",
        resemblesRowId: "r1",
    },
    {
        id: "r4",
        kind: "order",
        who: "Vikram Shetty",
        what: "Packing tape, 48mm",
        detail: "Box × 12",
        at: "2026-08-30",
        when: "6 days waiting",
        status: "Paid",
        tone: "settled",
        amountMinor: 1_132_800,
        currency: "INR",
    },
];

const TONE: Record<Row["tone"], string> = {
    attention:
        "border-warning/50 bg-warning-subtle text-warning-subtle-foreground",
    waiting: "border-border text-muted-foreground",
    settled: "border-success/40 text-success",
};

function money(row: Row) {
    if (row.amountMinor === null) {
        // QUESTION 3. An unpriced booking must read as unpriced, never as 0.
        // "—" alone is ambiguous (is it loading? zero? hidden?), so the row
        // says the words. This is the one place the prototype spends extra
        // vertical space on a phone rather than saving it.
        return (
            <span className="text-muted-foreground text-xs italic">
                No price set
            </span>
        );
    }
    const major = (row.amountMinor / 100).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
    });
    return (
        <span className="font-medium tabular-nums">
            {row.currency === "INR" ? "₹" : ""}
            {major}
        </span>
    );
}

/**
 * QUESTION 2 — one component or two?
 *
 * ONE. A row's contract is the same for both: who, what, when, status, amount.
 * What differs is the WHAT (a quantity vs a slot) and the meaning of WHEN, and
 * neither is enough to justify two components that would then drift apart.
 * Two renderers inside one row, not two rows.
 */
function LedgerRow({ row, resembles }: { row: Row; resembles?: Row }) {
    return (
        <li className="border-border border-b last:border-b-0">
            <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                {/* WHO + WHAT — never drops. If a row cannot say who it is
                    about and what it is, it is not a row. */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{row.who}</span>
                        <Badge
                            variant="outline"
                            className="shrink-0 text-[0.625rem] uppercase tracking-wide"
                        >
                            {row.kind === "order" ? "Sale" : "Appointment"}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-sm">
                        {row.what}{" "}
                        <span className="text-foreground/70">
                            · {row.detail}
                        </span>
                    </p>

                    {/* QUESTION 4 — the unproven identity.
                        Rendered as a QUESTION, never as a link, a merge, or a
                        shared avatar. The product does not know these are the
                        same person, and §"Say what is true" means it may not
                        imply it. The merchant is the one who knows. */}
                    {resembles ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                            Also a row for{" "}
                            <span className="text-foreground">
                                {resembles.who}
                            </span>
                            . Same person?{" "}
                            {/* A real target, not a 16px word. Measured at
                                320 in the browser: as inline text this was
                                the one affordance in this prototype that
                                broke the rule the prototype is about. */}
                            <button
                                type="button"
                                className="text-foreground coarse:min-h-11 coarse:px-2 inline-flex items-center rounded-md underline underline-offset-2"
                            >
                                Link them
                            </button>
                        </p>
                    ) : null}
                </div>

                {/* WHEN — drops to sit beside the status on a phone rather
                    than disappearing: on the shop floor "how long has this
                    waited" is the reason the merchant opened the list. */}
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums sm:w-28 sm:text-right">
                        {row.when}
                    </span>
                    <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${TONE[row.tone]}`}
                    >
                        {row.status}
                    </span>
                    <span className="ml-auto shrink-0 text-right text-sm sm:ml-0 sm:w-32">
                        {money(row)}
                    </span>
                </div>

                {/* QUESTION 5 — no hover anywhere. The action is a real
                    button, present at every width, at a touch size. A row
                    action revealed on hover does not exist on a phone or a
                    shop floor. */}
                <Button
                    size="sm"
                    variant="outline"
                    className="w-full shrink-0 sm:w-auto"
                >
                    {row.kind === "order" ? "Fulfil" : "Confirm"}
                </Button>
            </div>
        </li>
    );
}

function Answer({
    n,
    question,
    children,
}: {
    n: number;
    question: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border-border border-t py-4">
            <h3 className="text-sm font-semibold">
                {n}. {question}
            </h3>
            <p className="text-muted-foreground mt-1 max-w-prose text-sm">
                {children}
            </p>
        </div>
    );
}

export default function LedgerPrototype() {
    const byId = new Map(ROWS.map((r) => [r.id, r]));

    return (
        <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
            <h1 className="font-display text-2xl font-semibold">
                The ledger across four scenes
            </h1>
            <p className="text-muted-foreground mt-2 max-w-prose text-sm">
                A prototype for #172 — rough on purpose, so the choices in it
                can be argued with. Look at it at 320, 390 and 1440, in light
                and dark, with a mouse and with a thumb.
            </p>

            <ul className="border-border mt-8 rounded-lg border">
                {ROWS.map((row) => (
                    <LedgerRow
                        key={row.id}
                        row={row}
                        resembles={
                            row.resemblesRowId
                                ? byId.get(row.resemblesRowId)
                                : undefined
                        }
                    />
                ))}
            </ul>

            <section className="mt-10">
                <h2 className="text-lg font-semibold">
                    What this prototype claims
                </h2>

                <Answer n={1} question="What does a row carry?">
                    Who, what, when, status, amount — in that order of
                    importance. <strong>Who and what never drop.</strong> A row
                    that cannot say who it is about is not a row. As the
                    viewport narrows the row goes from one line to two: the
                    amount moves under the status rather than off the screen,
                    because &ldquo;how much&rdquo; is why a merchant is
                    scanning. The first thing to actually go would be the detail
                    line (<em>Chair × 2</em>), and it has not been dropped here
                    so you can see what would be lost.
                </Answer>

                <Answer n={2} question="One component or two?">
                    One. Both shapes share the same contract, and the
                    differences — a quantity versus a slot, a past instant
                    versus a future one — are two renderers inside one row. Two
                    components would drift apart within a release.
                </Answer>

                <Answer n={3} question="Which date does a sorted list mean?">
                    <strong>The date that decides what you do next.</strong> For
                    a sale that is when it was placed, because it has been
                    waiting since then; for an appointment it is when it starts,
                    because that is when someone turns up. So the column is not
                    a date at all — it is &ldquo;waiting&rdquo; or
                    &ldquo;in&rdquo;, and the direction is part of the value. A
                    column of bare dates would make a four-day-old order and an
                    appointment in four days look like the same fact.
                </Answer>

                <Answer n={4} question="How does an absent amount read?">
                    As the words <em>No price set</em>, never as{" "}
                    <span className="tabular-nums">0</span> and never as a bare
                    dash. Decision 4. An unpriced appointment is a normal thing
                    for a business to have; a zero is a claim about money that
                    nobody made.
                </Answer>

                <Answer
                    n={5}
                    question="What is rendered for an unproven identity?"
                >
                    The rows stay separate and each keeps the name it was
                    recorded under — <em>Ananya Rao</em> and <em>A. Rao</em> are
                    not silently merged, given a shared avatar, or totalled
                    together. The resemblance is offered as a question with an
                    action attached. The product does not know; the merchant
                    does. Until auto-linking ships, claiming otherwise would be
                    the one thing `PRODUCT.md` says not to reintroduce.
                </Answer>

                <Answer n={6} question="And hover?">
                    Nothing depends on it. Every action on a row is a real
                    control, present at every width, at a touch size. Two of the
                    four scenes have no pointer at all.
                </Answer>
            </section>
        </main>
    );
}
