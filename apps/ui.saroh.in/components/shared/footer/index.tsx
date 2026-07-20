import { Wordmark } from "@saroh/ui/wordmark";

export default function Footer() {
    return (
        <footer className="mt-16 border-t">
            <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 px-6 py-8 text-sm sm:flex-row sm:items-center">
                <Wordmark suffix="UI" />
                <span>
                    The Saroh design system · MIT © {new Date().getFullYear()}
                </span>
            </div>
        </footer>
    );
}
