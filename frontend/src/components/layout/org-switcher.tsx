import { useEffect, useRef, useState } from "react";
import { Building2, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "../../lib/auth-client";
import { useOrganization } from "./use-organization";

export function OrgSwitcher() {
  const activeOrg = useOrganization();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const org = activeOrg.data;
  if (!org) return null;

  const handleSave = () => {
    const trimmed = name.trim();
    setEditing(false);

    if (!trimmed || trimmed === org.name || saving) {
      return;
    }

    setSaving(true);
    void authClient.organization
      .update({
        data: { name: trimmed },
        organizationId: org.id,
      })
      .catch(() => {})
      .finally(() => {
        setSaving(false);
      });
  };

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={handleSave}
            className="h-7 flex-1 min-w-0 px-2"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            className="shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-b border-border">
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setName(org.name);
          setEditing(true);
        }}
        className="h-auto w-full justify-start gap-2 px-2.5 py-1.5 text-sm text-foreground group"
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">{org.name}</span>
        <Pencil className="w-3 h-3 text-muted-foreground ml-auto shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
      </Button>
    </div>
  );
}
