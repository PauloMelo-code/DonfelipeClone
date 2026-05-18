"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface InlineEditProps {
  value: string | number | null | undefined;
  type?: "text" | "number";
  onSave: (newValue: string | number) => Promise<void>;
  format?: (v: string | number) => string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Click-to-edit inline component.
 * - Click to edit, blur or Enter to save, Escape to cancel.
 * - Calls onSave (must be async) on blur/Enter.
 * - Shows toast feedback automatically.
 */
export function InlineEdit({
  value,
  type = "text",
  onSave,
  format,
  placeholder,
  className,
  inputClassName,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  const stringValue = value == null ? "" : String(value);

  // Re-sync draft when prop value changes (e.g. after save or external update)
  useEffect(() => {
    if (!editing) setDraft(stringValue);
  }, [stringValue, editing]);

  const commit = async () => {
    if (saving) return;
    if (draft === stringValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (type === "number" && (draft.trim() === "" || isNaN(Number(draft)))) {
        toast.error("Valor inválido");
        setDraft(stringValue);
        setEditing(false);
        return;
      }
      const next = type === "number" ? Number(draft) : draft;
      await onSave(next);
      toast.success("Salvo");
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "Erro ao salvar";
      toast.error(msg.length > 80 ? "Erro ao salvar" : msg);
      setDraft(stringValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <input
          type={type}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setDraft(stringValue);
              setEditing(false);
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={saving}
          placeholder={placeholder}
          className={cn(
            "bg-card/80 border border-cugini-orange/40 rounded px-1.5 py-0.5 outline-none focus:border-cugini-orange max-w-[160px]",
            inputClassName,
          )}
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "hover:bg-white/[0.05] rounded px-1 -mx-1 transition-colors text-left",
        className,
      )}
      title="Clique para editar"
    >
      {format ? format(value ?? 0) : (stringValue || placeholder || "-")}
    </button>
  );
}
