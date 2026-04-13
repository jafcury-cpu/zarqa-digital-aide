import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

const FAMILY_MEMBERS = ["Pessoal", "Cônjuge", "Filho(a)", "Pai/Mãe", "Outro"];
const CATEGORIES = ["geral", "médico", "jurídico", "financeiro", "escola", "trabalho", "serviço", "social"];

type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  family_member: string | null;
  category: string;
  notes: string | null;
  is_favorite: boolean;
};

type Props = {
  contact?: Contact;
  onSaved: () => void;
};

export function ContactFormDialog({ contact, onSaved }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [familyMember, setFamilyMember] = useState(contact?.family_member ?? "Pessoal");
  const [category, setCategory] = useState(contact?.category ?? "geral");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [isFavorite, setIsFavorite] = useState(contact?.is_favorite ?? false);

  const isEdit = !!contact;

  const resetForm = () => {
    if (!isEdit) {
      setName(""); setPhone(""); setEmail(""); setFamilyMember("Pessoal");
      setCategory("geral"); setNotes(""); setIsFavorite(false);
    }
  };

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        family_member: familyMember,
        category,
        notes: notes.trim() || null,
        is_favorite: isFavorite,
      };

      if (isEdit) {
        const { error } = await supabase.from("contacts").update(payload).eq("id", contact.id);
        if (error) throw error;
        toast.success("Contato atualizado");
      } else {
        const { error } = await supabase.from("contacts").insert(payload);
        if (error) throw error;
        toast.success("Contato criado");
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
    if (!contact) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
      if (error) throw error;
      toast.success("Contato removido");
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
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo contato</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar contato" : "Novo contato"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 11 99999-0000" />
            </div>
            <div className="grid gap-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Membro da família</Label>
              <Select value={familyMember} onValueChange={setFamilyMember}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Assunto</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre o contato" rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isFavorite} onCheckedChange={setIsFavorite} />
            <Label className="flex items-center gap-1.5">
              <Star className="h-4 w-4 text-warning" /> Favorito
            </Label>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1">
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

export { FAMILY_MEMBERS, CATEGORIES };
export type { Contact };
