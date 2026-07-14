import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NotificationsPanel } from "@/components/settings/NotificationsPanel";
import { currentPermission, pushSupported } from "@/lib/push";

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const supported = pushSupported();
  const permission = currentPermission();
  const active = supported && permission === "granted";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label="Notificações de estoque"
        title="Ativar notificações de estoque"
      >
        <Bell className="h-4 w-4" />
        {!active && supported && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning ring-2 ring-background" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>Notificações</DialogTitle>
          </DialogHeader>
          <div className="px-5 pb-5">
            <NotificationsPanel compact />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}