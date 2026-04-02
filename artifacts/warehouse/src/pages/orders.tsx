import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Trash2, Send, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  supplier: string;
  quantity: number;
}

interface Order {
  id: number;
  supplier: string;
  status: "draft" | "sent";
  createdAt: string;
  items?: OrderItem[];
  itemCount?: number;
}

async function fetchOrders(): Promise<Order[]> {
  const res = await fetch("/api/orders/orders", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function fetchOrder(id: number): Promise<Order> {
  const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

async function generateDrafts(): Promise<void> {
  const res = await fetch("/api/orders/generate-drafts", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
}

async function updateItemQuantity(
  orderId: number,
  itemId: number,
  quantity: number
): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
}

async function removeItem(orderId: number, itemId: number): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/items/${itemId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
}

async function markAsSent(orderId: number): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/mark-sent`, {
    method: "PUT",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed");
}

export default function OrdersPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
  });

  const selectedOrderQuery = useQuery({
    queryKey: ["order", selectedOrder],
    queryFn: () => (selectedOrder ? fetchOrder(selectedOrder) : null),
    enabled: selectedOrder !== null,
  });

  const generateMutation = useMutation({
    mutationFn: generateDrafts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({ description: "Order drafts generated" });
    },
    onError: () => {
      toast({ description: "Failed to generate drafts", variant: "destructive" });
    },
  });

  const updateQuantityMutation = useMutation({
    mutationFn: ({ orderId, itemId, quantity }: any) =>
      updateItemQuantity(orderId, itemId, quantity),
    onSuccess: () => {
      if (selectedOrder) {
        queryClient.invalidateQueries({ queryKey: ["order", selectedOrder] });
      }
      toast({ description: "Quantity updated" });
    },
    onError: () => {
      toast({ description: "Failed to update", variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: ({ orderId, itemId }: any) => removeItem(orderId, itemId),
    onSuccess: () => {
      if (selectedOrder) {
        queryClient.invalidateQueries({ queryKey: ["order", selectedOrder] });
      }
      toast({ description: "Item removed" });
    },
    onError: () => {
      toast({ description: "Failed to remove", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: markAsSent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      if (selectedOrder) {
        queryClient.invalidateQueries({ queryKey: ["order", selectedOrder] });
      }
      setSelectedOrder(null);
      toast({ description: "Order marked as sent" });
    },
    onError: () => {
      toast({ description: "Failed to send", variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-lg font-bold">Admin Only</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Generate Drafts
        </Button>
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : ordersQuery.data && ordersQuery.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ordersQuery.data.map((order) => (
            <div
              key={order.id}
              onClick={() => setSelectedOrder(order.id)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                selectedOrder === order.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-border hover:border-blue-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold">{order.supplier}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.itemCount || 0} items
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-bold ${
                    order.status === "sent"
                      ? "bg-green-200 text-green-700"
                      : "bg-blue-200 text-blue-700"
                  }`}
                >
                  {order.status}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No orders yet</p>
        </div>
      )}

      {selectedOrder && selectedOrderQuery.data && (
        <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{selectedOrderQuery.data.supplier}</h2>
            {selectedOrderQuery.data.status === "draft" && (
              <Button
                onClick={() => sendMutation.mutate(selectedOrder)}
                disabled={sendMutation.isPending}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4" /> Mark as Sent
              </Button>
            )}
          </div>

          {selectedOrderQuery.data.items && selectedOrderQuery.data.items.length > 0 ? (
            <div className="space-y-2">
              {selectedOrderQuery.data.items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-3 rounded border-l-4 border-blue-500 flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      Supplier: {item.supplier}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => {
                        const qty = parseInt(e.target.value) || 0;
                        updateQuantityMutation.mutate({
                          orderId: selectedOrder,
                          itemId: item.id,
                          quantity: qty,
                        });
                      }}
                      disabled={
                        updateQuantityMutation.isPending ||
                        selectedOrderQuery.data.status !== "draft"
                      }
                      className="w-16 px-2 py-1 border rounded text-sm text-center"
                    />
                    {selectedOrderQuery.data.status === "draft" && (
                      <button
                        onClick={() =>
                          removeMutation.mutate({
                            orderId: selectedOrder,
                            itemId: item.id,
                          })
                        }
                        disabled={removeMutation.isPending}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No items in this order</p>
          )}
        </div>
      )}
    </div>
  );
}
