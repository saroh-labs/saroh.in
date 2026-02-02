import { AccountForm } from "@/components/settings/account/account-form";
import { Separator } from "@saroh/ui/separator";

export default function SettingsAccountPage() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Account</h3>
                <p className="text-muted-foreground text-sm">
                    Update your account settings. Set your preferred language
                    and timezone.
                </p>
            </div>
            <Separator />
            <AccountForm />
        </div>
    );
}
