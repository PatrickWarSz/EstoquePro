import { useState } from "react";
import { Plus, Pencil, Trash2, Mail, Phone, User, Truck, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStockStore } from "@/lib/stock-store";
import type { Supplier } from "@/lib/types";
import { toast } from "sonner";

export default function FornecedoresPage() {
  const { suppliers, suppliersHasMore, addSupplier, updateSupplier, removeSupplier, fetchMoreSuppliers } = useStockStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [form, setForm] = useState<Omit<Supplier, "id">>({ name: "", contact: "", phone: "", email: "", notes: "" });

  const startNew = () => {
    setEditing(null);
    setForm({ name: "", contact: "", phone: "", email: "", notes: "" });
    setOpen(true);
  };

  const startEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact: s.contact || "", phone: s.phone || "", email: s.email || "", notes: s.notes || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editing) { await updateSupplier(editing.id, form); toast.success("Fornecedor atualizado"); }
    else { await addSupplier(form); toast.success("Fornecedor adicionado"); }
    setOpen(false);
  };

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Fornecedores</h2>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie seus fornecedores</p>
        </div>
        <Button onClick={startNew} size="sm" className="gap-2"><Plus className="h-4 w-4" />Novo Fornecedor</Button>
      </div>

      {suppliers.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4"><Truck className="h-7 w-7 text-primary" /></div>
          <p className="text-base font-semibold">Nenhum fornecedor cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Adicione seu primeiro fornecedor para vinculá-lo aos pedidos</p>
          <Button onClick={startNew} className="mt-4 gap-2"><Plus className="h-4 w-4" />Adicionar Fornecedor</Button>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{s.name}</h3>
                    {s.contact && <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><User className="h-3 w-3" />{s.contact}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { removeSupplier(s.id); toast.success("Fornecedor removido"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  {s.phone && <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" />{s.phone}</p>}
                  {s.email && <p className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" />{s.email}</p>}
                  {s.notes && <p className="mt-2 text-muted-foreground line-clamp-2">{s.notes}</p>}
                </div>
              </Card>
            ))}
          </div>
          {suppliersHasMore && (
            <div className="mt-6 flex justify-center">
              <Button 
                onClick={async () => {
                  setLoadingMore(true);
                  await fetchMoreSuppliers(30, true);
                  setLoadingMore(false);
                }} 
                variant="outline" 
                disabled={loadingMore}
                className="gap-2"
              >
                {loadingMore ? "⏳ Carregando..." : <><ChevronDown className="h-4 w-4" />Carregar mais fornecedores</>}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Contato</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}