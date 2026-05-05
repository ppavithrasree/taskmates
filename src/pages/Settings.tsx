import { toast } from "sonner";
import { Moon, Shield, Sun, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useApp } from "@/context/AppContext";
import type { Visibility } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

const Settings = () => {
  const { currentUser, settings, updateTheme, updateUserSettings, runRetentionCleanup } = useApp();
  if (!currentUser) return null;

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
            <Input
              value={currentUser.customUsernames.join(", ")}
              onChange={(event) => updateUserSettings({ customUsernames: event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) })}
              placeholder="aria, maya"
              className="bg-background"
            />
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-soft">
          <h2 className="flex items-center gap-2 font-black"><Trash2 className="size-4 text-primary" /> Retention</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Auto-delete after</span>
            <span className="font-black">{currentUser.retentionDays} days</span>
          </div>
          <Slider min={1} max={60} step={1} value={[currentUser.retentionDays]} onValueChange={([retentionDays]) => updateUserSettings({ retentionDays })} />
          <Button variant="outline" onClick={() => { runRetentionCleanup(); toast.success("Retention cleanup checked locally."); }}>Run cleanup now</Button>
        </section>
      </div>
    </AppShell>
  );
};

export default Settings;
