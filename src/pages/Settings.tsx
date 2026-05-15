import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Clock3, Info, Moon, Shield, Sun, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import type { Visibility } from "@/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Settings = () => {
  const { currentUser, users, settings, updateTheme, updateTimeFormat, updateUserSettings, runRetentionCleanup, getAcceptedConnectionIds } = useApp();
  const [draftRetentionDays, setDraftRetentionDays] = useState(currentUser?.retentionDays ?? 5);
  const [confirmRetentionOpen, setConfirmRetentionOpen] = useState(false);
  const [retentionInfoOpen, setRetentionInfoOpen] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState("");
  const savedRetentionDays = currentUser?.retentionDays ?? 5;

  useEffect(() => {
    if (confirmRetentionOpen) return;
    setDraftRetentionDays(savedRetentionDays);
  }, [savedRetentionDays, confirmRetentionOpen]);

  if (!currentUser) return null;
  const connections = users.filter((user) => getAcceptedConnectionIds(currentUser.id).includes(user.id));

  const saveRetentionDays = () => {
    if (draftRetentionDays === currentUser.retentionDays) {
      toast.info("Auto-delete period is already saved.");
      return;
    }
    if (draftRetentionDays < currentUser.retentionDays) {
      setConfirmRetentionOpen(true);
      return;
    }
    applyRetentionDays();
  };

  const applyRetentionDays = () => {
    updateUserSettings({ retentionDays: draftRetentionDays });
    runRetentionCleanup();
    toast.success("Auto-delete period saved.");
    setConfirmRetentionOpen(false);
  };

  const discardRetentionDraft = () => {
    setDraftRetentionDays(currentUser.retentionDays);
  };

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-black"><Sun className="size-4 text-primary" /> Theme</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={settings.theme === "light" ? "border-primary bg-primary-soft text-primary" : "bg-card"}
              onClick={() => updateTheme("light")}
            >
              <Sun className="mr-2 size-4" /> Light
            </Button>
            <Button
              type="button"
              variant="outline"
              className={settings.theme === "dark" ? "border-accent bg-accent-soft text-accent" : "bg-card"}
              onClick={() => updateTheme("dark")}
            >
              <Moon className="mr-2 size-4" /> Dark
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 font-black"><Clock3 className="size-4 text-primary" /> Time Format</h2>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={(settings.timeFormat ?? "24") === "12" ? "border-primary bg-primary-soft text-primary" : "bg-card"}
              onClick={() => updateTimeFormat("12")}
            >
              12 hours
            </Button>
            <Button
              type="button"
              variant="outline"
              className={(settings.timeFormat ?? "24") === "24" ? "border-primary bg-primary-soft text-primary" : "bg-card"}
              onClick={() => updateTimeFormat("24")}
            >
              24 hours
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="flex items-center gap-2 font-black"><Shield className="size-4 text-primary" /> Privacy</h2>
          <Select value={currentUser.privacy} onValueChange={(value) => updateUserSettings({ privacy: value as Visibility })}>
            <SelectTrigger className="h-11 bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="connections">Connections</SelectItem>
              <SelectItem value="custom">Custom usernames</SelectItem>
            </SelectContent>
          </Select>
          {currentUser.privacy === "custom" && (
            <UsernameChecklist
              users={connections}
              selectedUsernames={currentUser.customUsernames}
              query={usernameQuery}
              onQueryChange={setUsernameQuery}
              onToggle={(username, checked) => {
                const current = currentUser.customUsernames ?? [];
                updateUserSettings({
                  customUsernames: checked
                    ? [...new Set([...current, username])]
                    : current.filter((item) => item !== username),
                });
              }}
            />
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-background p-3 text-left">
            <div className="flex min-w-0 items-center gap-3">
              {currentUser.notificationsEnabled === false ? <BellOff className="size-4 text-muted-foreground" /> : <Bell className="size-4 text-primary" />}
              <div className="min-w-0">
                <p className="font-black">Notifications</p>
                <p className="text-xs text-muted-foreground">{currentUser.notificationsEnabled === false ? "Off" : "On"}</p>
              </div>
            </div>
            <Switch
              checked={currentUser.notificationsEnabled !== false}
              onCheckedChange={(checked) => updateUserSettings({ notificationsEnabled: checked })}
              aria-label="Notifications"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-black"><Trash2 className="size-4 text-primary" /> Auto-Delete Period</h2>
            <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setRetentionInfoOpen(true)} aria-label="Auto-delete info">
              <Info className="size-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Auto-delete after</span>
            <span className="font-black">{currentUser.retentionDays} days</span>
          </div>
          <div className="space-y-2">
            <Slider min={1} max={60} step={1} value={[draftRetentionDays]} onValueChange={([retentionDays]) => setDraftRetentionDays(retentionDays)} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Selected</span>
              <span className="font-bold">{draftRetentionDays} days</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {draftRetentionDays !== currentUser.retentionDays && (
              <Button variant="ghost" onClick={discardRetentionDraft}>Cancel</Button>
            )}
            <Button variant="outline" onClick={saveRetentionDays}>Save</Button>
          </div>
        </section>
      </div>

      <AlertDialog open={confirmRetentionOpen} onOpenChange={setConfirmRetentionOpen}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Change auto-delete period?</AlertDialogTitle>
            <AlertDialogDescription>
              You are reducing the period from {currentUser.retentionDays} days to {draftRetentionDays} days. Older activity logs may be deleted after saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={discardRetentionDraft}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={applyRetentionDays}
            >
              Yes, save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={retentionInfoOpen} onOpenChange={setRetentionInfoOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader><DialogTitle>Auto-delete period</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            Posts, group messages, and notifications older than this period will be deleted automatically.
          </p>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

const UsernameChecklist = ({
  users,
  selectedUsernames,
  query,
  onQueryChange,
  onToggle,
}: {
  users: { id: string; username: string }[];
  selectedUsernames: string[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (username: string, checked: boolean) => void;
}) => {
  const filtered = users.filter((user) => user.username.toLowerCase().includes(query.trim().toLowerCase()));
  if (users.length === 0) return <p className="text-sm text-muted-foreground">Connect with people first, then choose custom usernames.</p>;
  return (
    <div className="space-y-3">
      <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search usernames" className="bg-background" />
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No matching usernames.</p>
        ) : (
          filtered.map((user) => (
            <label key={user.id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
              <Checkbox checked={selectedUsernames.includes(user.username)} onCheckedChange={(checked) => onToggle(user.username, checked === true)} />
              <span className="font-bold">{user.username}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

export default Settings;
