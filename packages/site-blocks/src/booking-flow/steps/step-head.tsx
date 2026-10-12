export function StepHead({ n, title }: { n: number; title: string }) {
    return (
        <div data-step={n} className="mb-3.5 flex items-center gap-2.5">
            <span
                aria-hidden="true"
                className="bg-site-fg text-site-bg flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold"
            >
                {n}
            </span>
            <h2 className="font-site-heading text-site-fg text-[calc(1.1875rem*var(--site-heading-scale,1))] font-semibold leading-tight tracking-[-0.02em]">
                {title}
            </h2>
        </div>
    );
}
