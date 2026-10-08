/**
 * What a tab draws until its unit lands (plans catalogue U7–U10). It says so
 * plainly rather than drawing an editor that does nothing; each tab replaces
 * its own stub and stops importing this.
 */
export function TabPlaceholder({ name }: { name: string }) {
    return (
        <section
            aria-label={name}
            className="rounded-[14px] border border-dashed border-border px-[18px] py-10 text-center text-[13px] text-muted-foreground"
        >
            {name} isn&apos;t built yet.
        </section>
    );
}
