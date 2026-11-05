import type { ReactNode } from "react";

/*
 * DataTable (BLOCKS.md): one rows model, drawn twice from the same data, a
 * `<table>` on a desk and the TablesA phone layout (owner, 24 Oct) below
 * 900px. CSS shows one; the hidden one is out of the reading order too.
 */

export interface Column {
    label: string;
    /**
     * What the column holds, for the phone layout: `code` (SAC/HSN, mono),
     * `value` (the taxable value), `tax`, `total`. Unset is text. The first
     * column is each row's name.
     */
    kind?: "code" | "value" | "tax" | "total";
}

/** A cell: words (a guide's may hold bold or a link), or yes/no (desk "Yes"/"No", phone ✓/—). */
export type Cell = ReactNode;

export interface Row {
    cells: readonly Cell[];
    /** The phone line's last words, e.g. "GST 5%". */
    note?: string;
}

export interface DataTableProps {
    /**
     * `invoice`: lines and their totals (a receipt on a phone). `compare`:
     * options side by side (yes/no as a check table, values as a card per
     * row). `simple`: a table inside a guide's text (a card per row).
     */
    variant: "invoice" | "compare" | "simple";
    /** The table's name for screen readers, usually its section's H2. */
    caption: string;
    columns: readonly Column[];
    rows: readonly Row[];
    /** The bold Total row (invoice): one cell per column, the first its name. */
    total?: readonly Cell[];
    /** `compare`: the column to tint on a phone (the one the page recommends). */
    highlight?: number;
    /** `compare`: the words a phone shows instead of the rows that aren't yes/no. */
    phoneNote?: ReactNode;
}

const NONE = new Set(["", "—", "-"]);
const empty = (c: Cell | undefined) =>
    c === undefined ||
    c === null ||
    (typeof c === "string" && NONE.has(c.trim()));
const words = (c: Cell | undefined) =>
    c === true ? "Yes" : c === false ? "No" : (c ?? "");
const yesNo = (r: Row) => r.cells.slice(1).every((c) => typeof c === "boolean");

function Mark({ on }: { on: boolean }) {
    return on ? (
        <span className="sp-dt-yes" role="img" aria-label="Yes">
            ✓
        </span>
    ) : (
        <span className="sp-dt-no" role="img" aria-label="No">
            —
        </span>
    );
}

function DeskTable({ variant, caption, columns, rows, total }: DataTableProps) {
    // GST tables set every column after the first right; a guide's text table only its numbers.
    const end = (i: number) =>
        i > 0 && (variant !== "simple" || columns[i]?.kind)
            ? "sp-dt-end"
            : undefined;
    const line = (cells: readonly Cell[], key: string, cls?: string) => (
        <tr key={key} className={cls}>
            {cells.map((c, i) =>
                i === 0 ? (
                    <th key={i} scope="row">
                        {words(c)}
                    </th>
                ) : (
                    <td key={i} className={end(i)}>
                        {words(c)}
                    </td>
                ),
            )}
        </tr>
    );
    return (
        <div className="sp-dt-box sp-dt-desk">
            <table>
                <caption className="sp-sr">{caption}</caption>
                <thead>
                    <tr>
                        {columns.map((c, i) => (
                            <th key={i} scope="col" className={end(i)}>
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => line(r.cells, String(i)))}
                    {total ? line(total, "total", "sp-dt-total") : null}
                </tbody>
            </table>
        </div>
    );
}

/** A `dl` of label/value pairs; the `total` pair last, bold over an Ink rule. */
function Pairs({
    pairs,
}: {
    pairs: { label: ReactNode; value: Cell; total?: boolean }[];
}) {
    const plain = pairs.filter((p) => !p.total);
    const sum = pairs.find((p) => p.total);
    return (
        <dl className="sp-dt-dl">
            {plain.map((p, i) => (
                <div key={i}>
                    <dt>{p.label}</dt>
                    <dd>{words(p.value)}</dd>
                </div>
            ))}
            {sum ? (
                <div className="sp-dt-sum">
                    <dt>{sum.label}</dt>
                    <dd>{words(sum.value)}</dd>
                </div>
            ) : null}
        </dl>
    );
}

/** Invoice: the lines, then everything about money in one block (TablesA "Receipt"). */
function PhoneInvoice({ caption, columns, rows, total }: DataTableProps) {
    const at = (k: Column["kind"]) => columns.findIndex((c) => c.kind === k);
    const value = at("value");
    const amount =
        value > 0 ? value : at("total") > 0 ? at("total") : at("code");
    const code = at("code");
    return (
        <div
            role="group"
            aria-label={caption}
            className="sp-dt-box sp-dt-rec sp-dt-phone"
        >
            <ul aria-label={`${caption}: lines`}>
                {rows.map((r, i) => {
                    const sub = r.cells
                        .map((c, j) => {
                            const k = columns[j]?.kind;
                            if (
                                j === 0 ||
                                j === amount ||
                                k === "tax" ||
                                k === "total" ||
                                k === "value" ||
                                empty(c)
                            )
                                return null;
                            return k === "code" ? (
                                <span key={j} className="sp-dt-code">
                                    {columns[j]?.label} {words(c)}
                                </span>
                            ) : (
                                <span key={j}>{words(c)}</span>
                            );
                        })
                        .filter(Boolean);
                    if (r.note) sub.push(<span key="note">{r.note}</span>);
                    return (
                        <li key={i}>
                            <span className="sp-dt-li">
                                <span className="sp-dt-name">
                                    {words(r.cells[0])}
                                </span>
                                {sub.length ? (
                                    <span className="sp-dt-sub">
                                        {sub.map((s, j) => (
                                            <span key={j}>
                                                {j > 0 ? " · " : null}
                                                {s}
                                            </span>
                                        ))}
                                    </span>
                                ) : null}
                            </span>
                            <span
                                className={
                                    amount === code
                                        ? "sp-dt-amt sp-dt-code"
                                        : "sp-dt-amt"
                                }
                            >
                                {words(r.cells[amount])}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {total ? (
                <Pairs
                    pairs={columns.flatMap((c, i) =>
                        i === 0 ||
                        !c.kind ||
                        c.kind === "code" ||
                        empty(total[i])
                            ? []
                            : [
                                  {
                                      label:
                                          c.kind === "value"
                                              ? "Taxable value"
                                              : c.kind === "total"
                                                ? words(total[0]) || "Total"
                                                : c.label,
                                      value: total[i] ?? "",
                                      total: c.kind === "total",
                                  },
                              ],
                    )}
                />
            ) : null}
        </div>
    );
}

/** A card per row: its name, its code, then the other columns as pairs. */
function PhoneCards({ columns, rows, variant }: DataTableProps) {
    const code = columns.findIndex((c) => c.kind === "code");
    return (
        <div
            className={
                variant === "simple"
                    ? "sp-dt-cards sp-dt-phone sp-dt-cards-simple"
                    : "sp-dt-cards sp-dt-phone"
            }
        >
            {rows.map((r, i) => (
                <div key={i} className="sp-dt-box sp-dt-card">
                    <span className="sp-dt-name">{words(r.cells[0])}</span>
                    {code > 0 && !empty(r.cells[code]) ? (
                        <span className="sp-dt-sub sp-dt-code">
                            {columns[code]?.label} {words(r.cells[code])}
                        </span>
                    ) : null}
                    <Pairs
                        pairs={columns.flatMap((c, j) =>
                            j === 0 || j === code || empty(r.cells[j])
                                ? []
                                : [
                                      {
                                          label: c.label,
                                          value: r.cells[j] ?? "",
                                          total: c.kind === "total",
                                      },
                                  ],
                        )}
                    />
                </div>
            ))}
        </div>
    );
}

/** Two or three options, yes/no per row: a small table with ✓ / — (TablesA "check"). */
function PhoneCheck({
    caption,
    columns,
    rows,
    highlight,
    phoneNote,
}: DataTableProps) {
    const tint = (i: number) => (i === highlight ? "sp-dt-tint" : undefined);
    return (
        <div className="sp-dt-phone sp-dt-checkwrap">
            <table className="sp-dt-check">
                <caption className="sp-sr">{caption}</caption>
                <thead>
                    <tr>
                        {columns.map((c, i) => (
                            <th key={i} scope="col" className={tint(i)}>
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.filter(yesNo).map((r, i) => (
                        <tr key={i}>
                            <th scope="row">{words(r.cells[0])}</th>
                            {r.cells.slice(1).map((c, j) => (
                                <td key={j} className={tint(j + 1)}>
                                    <Mark on={c === true} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {phoneNote ? <div className="sp-dt-pnote">{phoneNote}</div> : null}
        </div>
    );
}

/** A table: invoice lines, options side by side, or a table in a guide's text. */
export function DataTable(props: DataTableProps) {
    const { variant, rows } = props;
    const phone =
        variant === "invoice" ? (
            <PhoneInvoice {...props} />
        ) : variant === "compare" && rows.some(yesNo) ? (
            <PhoneCheck {...props} />
        ) : (
            <PhoneCards {...props} />
        );
    return (
        <div className={variant === "simple" ? "sp-dt sp-dt-simple" : "sp-dt"}>
            <DeskTable {...props} />
            {phone}
        </div>
    );
}
