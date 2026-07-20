/**
 * App-root loading skeleton. Rendered by Next for any segment that suspends,
 * so a slow API shows a skeleton instead of a blank/frozen route. Individual
 * segments can add their own loading.tsx to override this baseline.
 */
export default function Loading() {
    return (
        <main className="mx-auto max-w-4xl p-8" aria-busy="true">
            <div className="mb-6 h-8 w-48 animate-pulse rounded-md bg-muted" />
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-20 animate-pulse rounded-lg bg-muted"
                    />
                ))}
            </div>
        </main>
    );
}
