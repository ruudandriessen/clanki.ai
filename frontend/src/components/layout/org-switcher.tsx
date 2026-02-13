import { useEffect, useRef, useState } from "react";
import { Building2, Pencil, Check } from "lucide-react";
import { authClient } from "../../lib/auth-client";
import { useOrganization } from "./use-organization";

export function OrgSwitcher() {
  const activeOrg = useOrganization();
  const [editing, setEditing] = useState(false);
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

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== org.name) {
      await authClient.organization.update({
        data: { name: trimmed },
        organizationId: org.id,
      });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={handleSave}
            className="flex-1 min-w-0 px-2 py-1 rounded-md text-sm bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-b border-border">
      <button
        type="button"
        onClick={() => {
          setName(org.name);
          setEditing(true);
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors group"
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">{org.name}</span>
        <Pencil className="w-3 h-3 text-muted-foreground ml-auto shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}
