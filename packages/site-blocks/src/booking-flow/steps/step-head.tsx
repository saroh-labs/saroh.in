export function StepHead({ n, title }: { n: number; title: string }) {
    return (
        <div data-step={n} className="mb-3.5 flex items-center gap-2.5">
            <span
                aria-hidden="true"
                className="bg-site-fg text-site-bg flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold"
            >
                {n}
            </span>
            {/* Focusable by the page alone: Back and Forward put focus here
                (U9), so a screen reader hears the step it is on. */}
            <h2
                tabIndex={-1}
                className="font-site-heading text-site-fg text-[calc(1.1875rem*var(--site-heading-scale,1))] font-semibold leading-tight tracking-[-0.02em] outline-none"
            >
                {title}
            </h2>
        </div>
    );
}
