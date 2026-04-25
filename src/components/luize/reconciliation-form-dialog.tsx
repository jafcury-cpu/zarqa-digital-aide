import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

type ReconciliationRow = {
  id: string;
  institution: string;
  progress_pct: number;
  current_phase: string;
  note: string | null;
};

type Props = {
  row?: ReconciliationRow;
  onSaved: () => void;
};

export function ReconciliationFormDialog({ row, onSaved }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [institution, setInstitution] = useState(row?.institution ?? "");
  const [progressPct, setProgressPct] = useState(String(row?.progress_pct ?? 0));
  const [currentPhase, setCurrentPhase] = useState(row?.current_phase ?? "manual");
  const [note, setNote] = useState(row?.note ?? "");

  const isEdit = !!row;

  const resetForm = () => {
    if (!isEdit) {
      setInstitution(""); setProgressPct("0"); setCurrentPhase("manual"); setNote("");
    }
  };

  const handleSave = async () => {
    if (!user || !institution.trim()) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        institution: institution.trim(),
        progress_pct: parseInt(progressPct) || 0,
        current_phase: currentPhase,
        note: note.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("reconciliation_status").update(payload).eq("id", row.id);
        if (error) throw error;
        toast.success("Conciliação atualizada");
      } else {
        const { error } = await supabase.from("reconciliation_status").insert(payload);
        if (error) throw error;
        toast.success("Conciliação criada");
      }
      resetForm();
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("reconciliation_status").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Conciliação removida");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nova conciliação</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar conciliação" : "Nova conciliação"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Instituição</Label>
            <Input value={institution} onChange={e => setInstitution(e.target.value)} placeholder="Ex: Itaú" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Progresso (%)</Label>
              <Input type="number" min={0} max={100} value={progressPct} onChange={e => setProgressPct(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Fase</Label>
              <Select value={currentPhase} onValueChange={setCurrentPhase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="semi-auto">Semi-automático</SelectItem>
                  <SelectItem value="auto">Automático</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Nota</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: OFX importado com sucesso" />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !institution.trim()} className="flex-1">
              {saving ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
            </Button>
            {isEdit && (
              <Button variant="destructive" size="icon" onClick={handleDelete} disabled={saving}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
