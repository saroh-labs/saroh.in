/**
 * Onboarding sits outside `(shell)`: no sidebar, because what the business
 * does is not decided yet. The business step draws its own split
 * (`SplitShell`), so this layout adds nothing around it; the modules step,
 * reached from Home, carries the slim header in its own layout.
 */
export default function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
