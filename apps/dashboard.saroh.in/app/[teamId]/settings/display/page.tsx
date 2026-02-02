import { DisplayForm } from "@/components/settings/display/display-form";
import { Separator } from "@saroh/ui/separator";

export default function SettingsDisplayPage() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Display</h3>
                <p className="text-muted-foreground text-sm">
                    Turn items on or off to control what&apos;s displayed in the
                    app.
                </p>
            </div>
            <Separator />
            <DisplayForm />
        </div>
    );
}
