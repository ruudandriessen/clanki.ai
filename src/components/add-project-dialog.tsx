import { Dialog } from "@/components/ui/dialog";
import { Project } from "@/lib/collections";
import { AddProjectDialogBody } from "./add-project-dialog-body";

export function AddProjectDialog({
  open,
  onClose,
  organizationId,
  existingProjects,
  autoInstall = false,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string | null;
  existingProjects: Project[];
  autoInstall?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      {open ? (
        <AddProjectDialogBody
          onClose={onClose}
          organizationId={organizationId}
          existingProjects={existingProjects}
          autoInstall={autoInstall}
        />
      ) : null}
    </Dialog>
  );
}
