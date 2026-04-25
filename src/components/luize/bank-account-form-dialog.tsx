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

type BankAccount = {
  id: string;
  bank_name: string;
  account_type: string;
  description: string | null;
  balance: number;
  reconciliation_pct: number;
  reconciliation_note: string | null;
};

type Props = {
  account?: BankAccount;
  onSaved: () => void;
};

export function BankAccountFormDialog({ account, onSaved }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bankName, setBankName] = useState(account?.bank_name ?? "");
  const [accountType, setAccountType] = useState(account?.account_type ?? "corrente");
  const [description, setDescription] = useState(account?.description ?? "");
  const [balance, setBalance] = useState(String(account?.balance ?? 0));
  const [reconciliationPct, setReconciliationPct] = useState(String(account?.reconciliation_pct ?? 0));
  const [reconciliationNote, setReconciliationNote] = useState(account?.reconciliation_note ?? "");

  const isEdit = !!account;

  const resetForm = () => {
    if (!isEdit) {
      setBankName("");
      setAccountType("corrente");
      setDescription("");
      setBalance("0");
      setReconciliationPct("0");
      setReconciliationNote("");
    }
  };

  const handleSave = async () => {
    if (!user || !bankName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        bank_name: bankName.trim(),
        account_type: accountType,
        description: description.trim() || null,
        balance: parseFloat(balance) || 0,
        reconciliation_pct: parseInt(reconciliationPct) || 0,
        reconciliation_note: reconciliationNote.trim() || null,
      };

      if (isEdit) {
        const { error } = await supabase.from("bank_accounts").update(payload).eq("id", account.id);
        if (error) throw error;
        toast.success("Conta atualizada");
      } else {
        const { error } = await supabase.from("bank_accounts").insert(payload);
        if (error) throw error;
        toast.success("Conta criada");
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
    if (!account) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("bank_accounts").delete().eq("id", account.id);
      if (error) throw error;
      toast.success("Conta removida");
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
          <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nova conta</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar conta" : "Nova conta bancária"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Banco</Label>
            <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Ex: Itaú" />
          </div>
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Descrição</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Conta principal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Saldo (R$)</Label>
              <Input type="number" value={balance} onChange={e => setBalance(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Conciliação (%)</Label>
              <Input type="number" min={0} max={100} value={reconciliationPct} onChange={e => setReconciliationPct(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Nota de conciliação</Label>
            <Input value={reconciliationNote} onChange={e => setReconciliationNote(e.target.value)} placeholder="Ex: OFX importado" />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !bankName.trim()} className="flex-1">
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
