import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import type { Contact } from "@/components/luize/contact-form-dialog";

export type ImportantDate = {
  id: string;
  contact_id: string | null;
  title: string;
  event_date: string;
  recurrence: string;
  remind_days_before: number;
  notes: string | null;
  contact_name?: string;
};

type Props = {
  date?: ImportantDate;
  contacts: Contact[];
  onSaved: () => void;
};

export function ImportantDateFormDialog({ date, contacts, onSaved }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(date?.title ?? "");
  const [eventDate, setEventDate] = useState(date?.event_date ?? "");
  const [contactId, setContactId] = useState(date?.contact_id ?? "none");
  const [recurrence, setRecurrence] = useState(date?.recurrence ?? "anual");
  const [remindDays, setRemindDays] = useState(String(date?.remind_days_before ?? 3));
  const [notes, setNotes] = useState(date?.notes ?? "");

  const isEdit = !!date;

  const resetForm = () => {
    if (!isEdit) {
      setTitle(""); setEventDate(""); setContactId("none");
      setRecurrence("anual"); setRemindDays("3"); setNotes("");
    }
  };

  const handleSave = async () => {
    if (!user || !title.trim() || !eventDate) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        title: title.trim(),
        event_date: eventDate,
        contact_id: contactId === "none" ? null : contactId,
        recurrence,
        remind_days_before: parseInt(remindDays) || 3,
        notes: notes.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("important_dates").update(payload).eq("id", date.id);
        if (error) throw error;
        toast.success("Data atualizada");
      } else {
        const { error } = await supabase.from("important_dates").insert(payload);
        if (error) throw error;
        toast.success("Data criada");
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
    if (!date) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("important_dates").delete().eq("id", date.id);
      if (error) throw error;
      toast.success("Data removida");
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
          <Button size="sm" variant="outline" className="gap-1.5"><CalendarPlus className="h-4 w-4" /> Nova data</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar data importante" : "Nova data importante"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Aniversário de casamento" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data *</Label>
              <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contato associado</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="unica">Única</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Lembrar (dias antes)</Label>
              <Input type="number" min={0} max={30} value={remindDays} onChange={e => setRemindDays(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Presente já comprado" rows={2} />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !title.trim() || !eventDate} className="flex-1">
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
