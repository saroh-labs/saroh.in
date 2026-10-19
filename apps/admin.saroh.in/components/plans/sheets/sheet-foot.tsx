"use client";

/**
 * The sheets' foot (admin redesign U12): no Save of their own (R21), only
 * how they save. The way out is the sheet's own Close in its corner, or Esc.
 */
export function SheetFoot({ canEdit }: { canEdit: boolean }) {
    return (
        <p className="border-t border-border px-6 py-3.5 text-[12px] text-muted-foreground">
            {canEdit
                ? "Every change is saved to the draft as you make it."
                : "You can read pricing but not change it."}
        </p>
    );
}
