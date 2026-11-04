/** Numbered steps as cards: a tool's, a template's or a help article's "how". */
export function StepList({
    steps,
    className = "md:grid-cols-2 md:gap-5 xl:grid-cols-4",
}: {
    steps: readonly { title: string; text: string }[];
    className?: string;
}) {
    return (
        <ol className={`m-0 grid list-none gap-3 p-0 ${className}`}>
            {steps.map((s, i) => (
                <li
                    key={s.title}
                    className="flex flex-col gap-2 rounded-mk-card border border-border bg-card p-5"
                >
                    <span className="font-mono text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                    </span>
                    <b className="text-[17px]">{s.title}</b>
                    <span className="text-[15px] leading-normal text-mk-copy">
                        {s.text}
                    </span>
                </li>
            ))}
        </ol>
    );
}
