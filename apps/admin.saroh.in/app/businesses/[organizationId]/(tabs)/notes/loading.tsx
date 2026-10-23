import { PanelSkeleton } from "@/components/states/panel-skeleton";

/** Notes on its way, under the header and tabs the layout already drew. */
export default function NotesLoading() {
    return <PanelSkeleton label="Loading notes" rows={3} />;
}
