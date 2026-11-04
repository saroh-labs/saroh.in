/** A fact nobody has checked yet, marked where it stands. */
export function ConfirmTag({ children = "[confirm]" }: { children?: string }) {
    return (
        <span className="whitespace-nowrap rounded-full bg-mk-soon px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-brand-700">
            {children}
        </span>
    );
}
