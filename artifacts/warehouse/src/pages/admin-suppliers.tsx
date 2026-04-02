import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Mail, Phone, Edit2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

interface Supplier {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  companyId: number;
}

async function fetchSuppliers(): Promise<Supplier[]> {
  const res = await fetch("/api/suppliers", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function createSupplier(data: any): Promise<Supplier> {
  const res = await fetch("/api/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function updateSupplier(id: number, data: any): Promise<Supplier> {
  const res = await fetch(`/api/suppliers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function deleteSupplier(id: number): Promise<void> {
  const res = await fetch(`/api/suppliers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
}

export default function AdminSuppliersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", notes: "" });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setFormData({ name: "", email: "", phone: "", notes: "" });
      setShowForm(false);
      toast({ description: "Supplier created" });
    },
    onError: () => {
      toast({ description: "Failed to create supplier", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => updateSupplier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setEditing(null);
      setFormData({ name: "", email: "", phone: "", notes: "" });
      toast({ description: "Supplier updated" });
    },
    onError: () => {
      toast({ description: "Failed to update supplier", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ description: "Supplier deleted" });
    },
    onError: () => {
      toast({ description: "Failed to delete supplier", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ description: "Supplier name is required", variant: "destructive" });
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditing(supplier.id);
    setFormData({
      name: supplier.name,
      email: supplier.email || "",
      phone: supplier.phone || "",
      notes: supplier.notes || "",
    });
    setShowForm(true);
  };

  if (!isAdmin) {
    return <div className="p-4 text-red-600">Admin only</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormData({ name: "", email: "", phone: "", notes: "" });
            setShowForm(!showForm);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
          <input
            type="text"
            placeholder="Supplier name *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <textarea
            placeholder="Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            rows={2}
            disabled={createMutation.isPending || updateMutation.isPending}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editing ? "Update" : "Create"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {suppliersQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : suppliersQuery.data && suppliersQuery.data.length > 0 ? (
        <div className="space-y-2">
          {suppliersQuery.data.map((supplier) => (
            <div key={supplier.id} className="bg-white border-2 border-border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{supplier.name}</p>
                  {supplier.email && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Mail className="h-3 w-3" /> {supplier.email}
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {supplier.phone}
                    </div>
                  )}
                  {supplier.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{supplier.notes}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(supplier)}
                    className="p-2 hover:bg-blue-100 rounded text-blue-600"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(supplier.id)}
                    disabled={deleteMutation.isPending}
                    className="p-2 hover:bg-red-100 rounded text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No suppliers yet</p>
        </div>
      )}
    </div>
  );
}
