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

type CreditCardRow = {
  id: string;
  card_name: string;
  brand: string;
  credit_limit: number;
  used_amount: number;
  closing_day: number;
  due_day: number;
};

type Props = {
  card?: CreditCardRow;
  onSaved: () => void;
};

export function CreditCardFormDialog({ card, onSaved }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardName, setCardName] = useState(card?.card_name ?? "");
  const [brand, setBrand] = useState(card?.brand ?? "Visa");
  const [creditLimit, setCreditLimit] = useState(String(card?.credit_limit ?? 0));
  const [usedAmount, setUsedAmount] = useState(String(card?.used_amount ?? 0));
  const [closingDay, setClosingDay] = useState(String(card?.closing_day ?? 1));
  const [dueDay, setDueDay] = useState(String(card?.due_day ?? 10));

  const isEdit = !!card;

  const resetForm = () => {
    if (!isEdit) {
      setCardName(""); setBrand("Visa"); setCreditLimit("0");
      setUsedAmount("0"); setClosingDay("1"); setDueDay("10");
    }
  };

  const handleSave = async () => {
    if (!user || !cardName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        card_name: cardName.trim(),
        brand,
        credit_limit: parseFloat(creditLimit) || 0,
        used_amount: parseFloat(usedAmount) || 0,
        closing_day: parseInt(closingDay) || 1,
        due_day: parseInt(dueDay) || 10,
      };

      if (isEdit) {
        const { error } = await supabase.from("credit_cards").update(payload).eq("id", card.id);
        if (error) throw error;
        toast.success("Cartão atualizado");
      } else {
        const { error } = await supabase.from("credit_cards").insert(payload);
        if (error) throw error;
        toast.success("Cartão criado");
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
    if (!card) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("credit_cards").delete().eq("id", card.id);
      if (error) throw error;
      toast.success("Cartão removido");
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
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo cartão</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cartão" : "Novo cartão de crédito"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Nome do cartão</Label>
            <Input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Ex: Itaú Visa" />
          </div>
          <div className="grid gap-1.5">
            <Label>Bandeira</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Visa">Visa</SelectItem>
                <SelectItem value="Mastercard">Mastercard</SelectItem>
                <SelectItem value="Elo">Elo</SelectItem>
                <SelectItem value="Amex">Amex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Limite (R$)</Label>
              <Input type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Usado (R$)</Label>
              <Input type="number" value={usedAmount} onChange={e => setUsedAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Dia fechamento</Label>
              <Input type="number" min={1} max={31} value={closingDay} onChange={e => setClosingDay(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Dia vencimento</Label>
              <Input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !cardName.trim()} className="flex-1">
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
