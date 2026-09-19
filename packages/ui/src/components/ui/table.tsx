import * as React from "react";
import { cn } from "../../lib/utils";

const Table = React.forwardRef<
    HTMLTableElement,
    React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
        <table
            ref={ref}
            className={cn("w-full caption-bottom text-sm", className)}
            {...props}
        />
    </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
    <thead
        ref={ref}
        // The header rule is one step stronger than the row rules, so the
        // head reads as a head without a fill (brand file §10).
        className={cn("[&_tr]:border-b [&_tr]:border-border-strong", className)}
        {...props}
    />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
    <tbody
        ref={ref}
        className={cn("[&_tr:last-child]:border-0", className)}
        {...props}
    />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
    HTMLTableSectionElement,
    React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
    <tfoot
        ref={ref}
        className={cn(
            "border-t bg-muted font-medium [&>tr]:last:border-b-0",
            className,
        )}
        {...props}
    />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
    HTMLTableRowElement,
    React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
    <tr
        ref={ref}
        className={cn(
            /*
             * Row states (brand file §10, §22). Horizontal rules only — no
             * zebra, no vertical dividers. Hover is a translucent Ink wash, the
             * one sanctioned alpha, so it reads over white AND over a selected
             * row instead of erasing the selection. Selected is Saffron 50 with
             * a 3px inset marker, so it survives greyscale; never a border,
             * which would shift the row by a pixel. `data-attention` marks a
             * row that needs someone, in the Destructive tint.
             */
            "border-b transition-colors duration-fast hover:bg-foreground/[0.035] data-[attention=true]:bg-destructive-subtle data-[state=selected]:bg-brand-subtle data-[state=selected]:shadow-[inset_3px_0_0_hsl(var(--highlight))]",
            className,
        )}
        {...props}
    />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
    HTMLTableCellElement,
    React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
    <th
        ref={ref}
        className={cn(
            // Labels stop at 11px: mono, uppercase, tracked (brand file §3).
            "h-10 px-4 text-left align-middle font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground [&:has([role=checkbox])]:pr-0",
            className,
        )}
        {...props}
    />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
    HTMLTableCellElement,
    React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
    <td
        ref={ref}
        className={cn(
            // 10px rows by default; density comes from space, never from
            // smaller type.
            "px-4 py-2.5 align-middle [&:has([role=checkbox])]:pr-0",
            className,
        )}
        {...props}
    />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
    HTMLTableCaptionElement,
    React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
    <caption
        ref={ref}
        className={cn("mt-4 text-sm text-muted-foreground", className)}
        {...props}
    />
));
TableCaption.displayName = "TableCaption";

export {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
};
