export function StepHead({ n, title }: { n: number; title: string }) {
    return (
        <div className="mb-3.5 flex items-center gap-2.5">
            <span
                aria-hidden="true"
                className="bg-site-fg text-site-bg flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold"
            >
                {n}
            </span>
            <h2 className="font-display text-site-fg text-[19px] font-semibold tracking-[-0.02em]">
                {title}
            </h2>
        </div>
    );
}
