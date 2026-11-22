import { ListTable, ListTableHead, listTable } from "@saroh/ui/list-table";
import { Skeleton } from "@saroh/ui/skeleton";

/**
 * A console table on its way: the one table look (`ListTable`, its head
 * band and row rule) with the table's own number of columns, so the rows
 * land where the grey was. The first column is the record's name and is
 * wider, as it is in every console table. One sentence for a screen
 * reader; the grey is hidden from it.
 */
export function TableSkeleton({
    label,
    columns,
    rows = 8,
}: {
    /** What is loading, read out: "Loading businesses". */
    label: string;
    columns: number;
    rows?: number;
}) {
    const grid = {
        gridTemplateColumns: `minmax(0,2fr) repeat(${columns - 1}, minmax(0,1fr))`,
    };
    return (
        <ListTable role="status" aria-busy="true" data-columns={columns}>
            <span className="sr-only">{label}</span>
            <ListTableHead className="grid gap-4" style={grid}>
                {Array.from({ length: columns }, (_, i) => (
                    <Skeleton key={i} className="h-3 w-16 rounded-[4px]" />
                ))}
            </ListTableHead>
            <div aria-hidden>
                {Array.from({ length: rows }, (_, row) => (
                    <div
                        key={row}
                        className={`${listTable.rowStill} grid items-center gap-4`}
                        style={grid}
                    >
                        {Array.from({ length: columns }, (_, i) =>
                            // Only the first cell sweeps: one moving line is
                            // a thing loading, every cell moving is noise.
                            i === 0 ? (
                                <Skeleton
                                    key={i}
                                    className="h-[11px] w-[70%] rounded-[4px]"
                                />
                            ) : (
                                <div
                                    key={i}
                                    className="h-[9px] w-[60%] rounded-[4px] bg-muted/70"
                                />
                            ),
                        )}
                    </div>
                ))}
            </div>
        </ListTable>
    );
}
