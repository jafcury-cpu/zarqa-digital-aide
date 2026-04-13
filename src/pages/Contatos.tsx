import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/zarqa/section-card";
import { LoadingPanel } from "@/components/zarqa/loading-panel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactFormDialog, FAMILY_MEMBERS, CATEGORIES, type Contact } from "@/components/zarqa/contact-form-dialog";
import { Mail, Phone, Star, User, Users } from "lucide-react";

const Contatos = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");

  const loadContacts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, email, family_member, category, notes, is_favorite")
        .order("is_favorite", { ascending: false })
        .order("name");
      if (error) throw error;
      setContacts((data as Contact[]) ?? []);
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    loadContacts().finally(() => setLoading(false));
  }, [user, loadContacts]);

  const filtered = useMemo(() =>
    contacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone?.includes(search)) ||
        (c.email?.toLowerCase().includes(search.toLowerCase()));
      const matchesFamily = familyFilter === "todos" || c.family_member === familyFilter;
      const matchesCategory = categoryFilter === "todos" || c.category === categoryFilter;
      return matchesSearch && matchesFamily && matchesCategory;
    }), [contacts, search, familyFilter, categoryFilter]);

  const stats = useMemo(() => ({
    total: contacts.length,
    favorites: contacts.filter(c => c.is_favorite).length,
    families: new Set(contacts.map(c => c.family_member).filter(Boolean)).size,
  }), [contacts]);

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <LoadingPanel lines={5} />
        <LoadingPanel lines={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="grid gap-4 grid-cols-3">
        <div className="rounded-2xl border border-border bg-panel p-5">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="mt-2 font-display text-3xl text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-5">
          <p className="text-sm text-muted-foreground">Favoritos</p>
          <p className="mt-2 font-display text-3xl text-warning">{stats.favorites}</p>
        </div>
        <div className="rounded-2xl border border-border bg-panel p-5">
          <p className="text-sm text-muted-foreground">Membros</p>
          <p className="mt-2 font-display text-3xl text-primary">{stats.families}</p>
        </div>
      </div>

      {/* Filters + Add */}
      <SectionCard title="Agenda de Contatos" description="Organizado por membro da família e assunto" eyebrow="Contacts">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail"
            className="max-w-xs"
          />
          <Select value={familyFilter} onValueChange={setFamilyFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Membro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos membros</SelectItem>
              {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Assunto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos assuntos</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <ContactFormDialog onSaved={loadContacts} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Users className="h-10 w-10" />
            <p className="text-sm">{contacts.length === 0 ? "Nenhum contato cadastrado ainda" : "Nenhum contato encontrado com esses filtros"}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(contact => (
              <div key={contact.id} className="rounded-2xl border border-border bg-panel-elevated p-5 transition-colors hover:border-primary/30">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground flex items-center gap-1.5">
                        {contact.name}
                        {contact.is_favorite && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                      </p>
                      {contact.family_member && (
                        <p className="text-xs text-muted-foreground">{contact.family_member}</p>
                      )}
                    </div>
                  </div>
                  <ContactFormDialog contact={contact} onSaved={loadContacts} />
                </div>

                <div className="mt-3 space-y-1.5">
                  {contact.phone && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {contact.phone}
                    </p>
                  )}
                  {contact.email && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> {contact.email}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{contact.category}</Badge>
                </div>

                {contact.notes && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{contact.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* TODO: conectar com n8n webhook */}
    </div>
  );
};

export default Contatos;
