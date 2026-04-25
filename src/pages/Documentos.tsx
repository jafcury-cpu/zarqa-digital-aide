import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Download, Search, UploadCloud } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { SectionCard } from "@/components/zarqa/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fallbackDocuments, formatDateTime } from "@/lib/zarqa-mocks";

type StoredDocument = {
  id: string;
  name: string;
  category: string;
  file_url: string;
  created_at: string;
  preview?: string;
  origin?: "uploaded" | "demo";
};

const categories = ["Pessoal", "Jurídico", "Financeiro", "Saúde", "Imóveis"];
const maxUploadSize = 20 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFileName(name: string) {
  return name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
}

const Documentos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("todas");
  const [uploadCategory, setUploadCategory] = useState<string>("Pessoal");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("id, name, category, file_url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Falha ao listar documentos", description: error.message });
    } else {
      setDocuments((data as StoredDocument[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadDocuments();
  }, [user]);

  const mergedDocuments = useMemo(() => {
    const uploaded = documents.map((document) => ({
      ...document,
      preview: "Arquivo privado enviado para o storage da Luize.",
      origin: "uploaded" as const,
    }));
    const all = [
      ...uploaded,
      ...fallbackDocuments
        .filter((item) => !uploaded.some((doc) => doc.name === item.name))
        .map((document) => ({ ...document, origin: "demo" as const })),
    ];

    return all.filter((document) => {
      const matchesSearch = [document.name, document.category, document.preview].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "todas" || document.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, documents, search]);

  const uploadedCount = documents.length;
  const demoCount = Math.max(0, mergedDocuments.filter((document) => document.origin === "demo").length);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (file.size > maxUploadSize) {
      toast({
        variant: "destructive",
        title: "Arquivo acima do limite",
        description: `Envie arquivos de até ${formatFileSize(maxUploadSize)}.`,
      });
      event.target.value = "";
      return;
    }

    setUploading(true);
    const safeFileName = sanitizeFileName(file.name) || `arquivo-${Date.now()}`;
    const path = `${user.id}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, { upsert: false });

    if (uploadError) {
      toast({ variant: "destructive", title: "Falha no upload", description: uploadError.message });
      setUploading(false);
      return;
    }

    const { error: insertError } = await supabase.from("documents").insert({
      user_id: user.id,
      name: file.name,
      category: uploadCategory,
      file_url: path,
    });

    if (insertError) {
      await supabase.storage.from("documents").remove([path]);
      toast({ variant: "destructive", title: "Falha ao registrar documento", description: insertError.message });
    } else {
      toast({ title: "Documento enviado", description: `${file.name} foi salvo com sucesso.` });
      await loadDocuments();
    }

    setUploading(false);
    event.target.value = "";
  };

  const openDocument = async (document: StoredDocument) => {
    if (!document.file_url || !documents.some((item) => item.id === document.id)) {
      toast({ title: "Preview demo", description: document.preview || "Documento de demonstração sem arquivo vinculado." });
      return;
    }

    const { data, error } = await supabase.storage.from("documents").createSignedUrl(document.file_url, 60);

    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Falha ao abrir arquivo", description: error?.message || "Tente novamente." });
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Busca Semântica" description="Placeholder inicial para pesquisa de documentos" eyebrow="Document retrieval">
        {/* TODO: conectar com n8n webhook */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="info">Privado no storage</Badge>
          <Badge variant="outline">{uploadedCount} arquivos enviados</Badge>
          <Badge variant="outline">{demoCount} itens demo</Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px] xl:grid-cols-[minmax(0,1fr)_220px_280px]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, categoria ou contexto"
              className="h-14 rounded-2xl pl-11 text-base"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-14 rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categories.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="h-14 rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} />
            <Button
              type="button"
              variant="hero"
              className="h-14 rounded-2xl px-5"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <UploadCloud className="size-4" />
              {uploading ? "Enviando" : "Upload"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Arquivos ficam privados e são abertos via link assinado temporário. Limite de 20 MB por arquivo.</p>
      </SectionCard>

      <SectionCard title="Biblioteca de Documentos" description="Lista privada com preview e ações" eyebrow="Repository">
        <div className="grid gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-panel-elevated" />
            ))
          ) : mergedDocuments.length ? (
            mergedDocuments.map((document) => (
              <div
                key={document.id}
                className="grid gap-4 rounded-2xl border border-border bg-panel-elevated p-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.2fr)_0.8fr_180px] lg:items-center"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all font-medium text-foreground">{document.name}</p>
                    <Badge variant="outline">{document.category}</Badge>
                    <Badge variant={document.origin === "uploaded" ? "success" : "secondary"}>
                      {document.origin === "uploaded" ? "Privado" : "Demo"}
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{document.preview}</p>
                </div>
                <div className="sm:text-right lg:text-left">
                  <p className="text-kicker">Data</p>
                  <p className="mt-2 text-sm text-foreground">{formatDateTime(document.created_at)}</p>
                </div>
                <div className="flex gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
                  <Button variant="panel" className="w-full sm:w-auto" onClick={() => openDocument(document)}>
                    <Download className="size-4" />
                    {document.origin === "uploaded" ? "Abrir seguro" : "Abrir preview"}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-panel-elevated p-8 text-center">
              <p className="font-medium text-foreground">Nenhum documento encontrado</p>
              <p className="mt-2 text-sm text-muted-foreground">Ajuste os filtros ou envie um arquivo privado para começar.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default Documentos;
