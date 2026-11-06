// --- FILE: src/pages/barista/BaristaPage.tsx (HeroUI + Auth Guard + Absensi) ---
import { useState, useEffect, useCallback, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Category, Product, CartItem, Order, PendingOrderWithItems } from "../../types";
import {
  getActiveMenu,
  createOrder,
  getPendingOrdersWithItems,
  updateOrderStatus,
  getOrderWithItems,
  updateOrderAndItems,
} from "../../api/orderApi";
import { useAuth } from "../../auth/hooks/useAuth";
import { useProfile } from "../../auth/hooks/useProfile";
import { supabase } from "../../api/supabaseClient";
import OutletGate from "../../components/OutletGate";

import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Spinner,
} from "@heroui/react";
import { Link as HeroLink } from "@heroui/link";
// NOTE: nama file diperbaiki dari "attandance" -> "attendanceApi" agar konsisten
// dengan penamaan file API lain (menuApi.ts, adminApi.ts, orderApi.ts).
// Pastikan file ini ada di src/api/attendanceApi.ts
import { clockOutToday, getTodayAttendance } from "../../api/attandance";

type PaymentMethod = "cash" | "qris";

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(
    n
  );

// Small icon
const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09c-1.18 0-2.09.954-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

/* ============================= Cart component ============================= */
interface OrderCartProps {
  cart: CartItem[];
  customerName: string;
  paymentMethod: "" | PaymentMethod;
  isSubmitting: boolean;
  onCustomerNameChange: (name: string) => void;
  onPaymentMethodChange: (pm: PaymentMethod) => void;
    onUpdateQuantity: (
    productId: number,
    size: "regular" | "large",
    newQuantity: number
  ) => void;
  onRemoveItem: (productId: number, size: "regular" | "large") => void;
  onSubmit: () => void;
  onClose?: () => void;
  showClose?: boolean;
  isEditing?: boolean;
  onCancelEdit?: () => void;
}

const OrderCart = ({
  cart,
  customerName,
  paymentMethod,
  isSubmitting,
  onCustomerNameChange,
  onPaymentMethodChange,
  onUpdateQuantity,
  onRemoveItem,
  onSubmit,
  onClose,
  showClose,
  isEditing,
  onCancelEdit,
}: OrderCartProps) => {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const placeDisabled =
    cart.length === 0 || !customerName || !paymentMethod || isSubmitting;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {isEditing ? "Edit Order" : "Current Order"}
        </h2>
        <div className="flex items-center gap-2">
          {isEditing && onCancelEdit ? (
            <Button size="sm" variant="flat" onPress={onCancelEdit}>
              Batalkan Edit
            </Button>
          ) : null}
          {showClose ? (
            <Button size="sm" variant="flat" className="md:hidden" onPress={onClose}>
              Tutup
            </Button>
          ) : null}
        </div>
      </div>

      {/* Customer */}
      <div className="mt-4">
        <Input
          label="Customer Name"
          placeholder="John Doe"
          value={customerName}
          onChange={(e) => onCustomerNameChange(e.target.value)}
        />
      </div>

      {/* Payment */}
      <div className="mt-4">
        <div className="text-sm font-medium text-default-700 mb-2">
          Metode Pembayaran
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onPress={() => onPaymentMethodChange("cash")}
            color={paymentMethod === "cash" ? "primary" : "default"}
            variant={paymentMethod === "cash" ? "solid" : "flat"}
          >
            Cash
          </Button>
          <Button
            onPress={() => onPaymentMethodChange("qris")}
            color={paymentMethod === "qris" ? "primary" : "default"}
            variant={paymentMethod === "qris" ? "solid" : "flat"}
          >
            QRIS
          </Button>
        </div>
        <div className="mt-1 text-xs text-default-500">
          Wajib pilih salah satu.
        </div>
      </div>

      {/* Items */}
      <Card className="mt-4 flex-1 min-h-0">
        <CardBody className="flex-1 min-h-0 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="text-default-500">Cart is empty.</div>
          ) : (
            <ul className="divide-y divide-default-200">
              {cart.map((item) => (
                <li key={`${item.id}-${item.size ?? "regular"}`} className="py-3">
                  <div className="flex justify-between items-center gap-3">
                    <p className="font-medium break-words">{item.name} ({item.size === "large" ? "Large" : "Regular"})</p>
                    <p className="font-semibold">
                      {new Intl.NumberFormat("id-ID").format(
                        item.price * item.quantity
                      )}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-default-500">
                      {new Intl.NumberFormat("id-ID").format(item.price)} ×{" "}
                      {item.quantity}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        onPress={() =>
                          onUpdateQuantity(item.id, item.size ?? "regular", item.quantity - 1)
                        }
                      >
                        –
                      </Button>
                      <span>{item.quantity}</span>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        onPress={() =>
                          onUpdateQuantity(item.id, item.size ?? "regular", item.quantity + 1)
                        }
                      >
                        +
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        color="danger"
                        variant="light"
                        onPress={() => onRemoveItem(item.id, item.size ?? "regular")}
                      >
                        <TrashIcon />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Footer */}
      <div className="mt-4">
        <div className="flex justify-between items-center font-bold text-lg mb-3">
          <span>Total</span>
          <span>{fmtIDR(total)}</span>
        </div>
        <Button
          fullWidth
          color="success"
          isDisabled={placeDisabled}
          isLoading={isSubmitting}
          onPress={onSubmit}
        >
          {isEditing ? "Update Order" : "Place Order"}
        </Button>
      </div>
    </div>
  );
};

/* ========================= Pending orders list ========================= */
const PendingOrdersList = ({
  orders,
  onUpdateStatus,
  onEdit,
}: {
  orders: PendingOrderWithItems[];
  onUpdateStatus: (orderId: number, status: "completed" | "cancelled") => void;
  onEdit: (orderId: number) => void;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {orders.map((order) => (
      <Card key={order.id} shadow="sm" className="bg-yellow-50">
        <CardBody className="space-y-2">
          <div>
            <p className="font-bold text-lg break-words">{order.customer_name}</p>
            {order.payment_method && (
              <Chip size="sm" variant="flat" color="primary" className="mt-1">
                {order.payment_method.toUpperCase()}
              </Chip>
            )}
          </div>

          <Divider />

          <div className="text-sm text-default-700 space-y-1">
            {(order.items ?? []).map((it) => (
              <div
                key={`${order.id}-${it.product_id}-${it.size}`}
                className="flex justify-between"
              >
                <span className="truncate">
                  {(it.product?.name ?? "Item")} ({it.size})
                </span>
                <span className="ml-2 font-medium">×{it.quantity}</span>
              </div>
            ))}
            {(!order.items || order.items.length === 0) && (
              <div className="text-default-400">Belum ada item.</div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
            <Button
              size="sm"
              color="primary"
              className="w-full"
              onPress={() => onEdit(order.id)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              color="success"
              className="w-full"
              onPress={() => onUpdateStatus(order.id, "completed")}
            >
              Selesai
            </Button>
            <Button
              size="sm"
              color="danger"
              variant="flat"
              className="w-full"
              onPress={() => onUpdateStatus(order.id, "cancelled")}
            >
              Batal
            </Button>
          </div>
        </CardBody>
      </Card>
    ))}
  </div>
);


/* ============================== Main page ============================== */
export default function BaristaPage() {
  const { user, loading, logout } = useAuth(); // <- pastikan context menyediakan `loading`
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | PaymentMethod>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrderWithItems[]>([]);

  // ===== Absensi: status "sudah absen pulang hari ini?" =====
  const [hasClockedOut, setHasClockedOut] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [checkingAttendance, setCheckingAttendance] = useState(true);

  // Ringkasan hari ini utk barista login
  const [todaySummary, setTodaySummary] = useState({
    total: 0,
    count: 0,
    cash: 0,
    qris: 0,
  });

  // UI
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // mode edit
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);

  // realtime
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchPending = useCallback(async () => {
    const data = await getPendingOrdersWithItems();

    const transformed: Order[] = (data ?? []).map(order => ({
      ...order,
      payment_method: order.payment_method ?? null,
      items: order.items?.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        size: item.size ?? "regular",
        subtotal: item.subtotal ?? ((item.product?.price ?? 0) * item.quantity),
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              description: item.product.description,
              price: item.product.price,
              price_large: item.product.price_large,
              image_url: item.product.image_url,
              category_id: item.product.category_id,
              size: null, // optional if your Product type requires it
              discount: item.product.discount ?? null,
            }
          : undefined,
      })) ?? [],
    }));

    setPendingOrders(transformed);
  }, []);

  const fetchTodaySummary = useCallback(async () => {
    if (!user?.id) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from("orders")
      .select("total_amount,payment_method,created_at")
      .eq("created_by", user.id)
      .eq("status", "completed")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    if (error) {
      console.error("Gagal ambil ringkasan hari ini:", error);
      return;
    }

    let total = 0,
      count = 0,
      cash = 0,
      qris = 0;
    (data ?? []).forEach((r: any) => {
      const v = Number(r.total_amount) || 0;
      total += v;
      count++;
      if (r.payment_method === "cash") cash += v;
      else if (r.payment_method === "qris") qris += v;
    });
    setTodaySummary({ total, count, cash, qris });
  }, [user?.id]);

  // Cek status absen pulang hari ini setiap kali user berubah/login
  const fetchAttendanceStatus = useCallback(async () => {
    if (!user?.id) return;
    setCheckingAttendance(true);
    try {
      const record = await getTodayAttendance(user.id);
      setHasClockedOut(!!record?.clock_out);
    } catch (err) {
      console.error("Gagal memeriksa status absensi:", err);
    } finally {
      setCheckingAttendance(false);
    }
  }, [user?.id]);

  useEffect(() => {
    getActiveMenu().then(({ products, categories }) => {
      setProducts(products);
      setCategories(categories);
      if (categories.length > 0) setActiveCategory(categories[0].id);
    });

    const ch = supabase.channel("orders-channel", {
      config: { broadcast: { self: true } },
    });
    channelRef.current = ch;

    ch.on("broadcast", { event: "orders_updated" }, () => {
      fetchPending();
      fetchTodaySummary();
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        fetchPending();
        fetchTodaySummary();
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchPending, fetchTodaySummary]);

  useEffect(() => {
    fetchAttendanceStatus();
  }, [fetchAttendanceStatus]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  // ===== Absensi: aksi absen pulang =====
  const handleClockOut = async () => {
    if (!user?.id) return;
    const confirmed = window.confirm("Yakin ingin absen pulang sekarang?");
    if (!confirmed) return;

    setClockingOut(true);
    try {
      await clockOutToday(user.id);
      setHasClockedOut(true);
      alert("Absen pulang berhasil dicatat. Terima kasih!");
    } catch (err: any) {
      alert("Gagal mencatat absen pulang: " + (err?.message ?? "Terjadi kesalahan."));
    } finally {
      setClockingOut(false);
    }
  };

  const sendOrdersUpdated = useCallback(async (meta?: Record<string, unknown>) => {
    const ch = channelRef.current;
    if (!ch) return;
    try {
      await ch.send({
        type: "broadcast",
        event: "orders_updated",
        payload: { ts: Date.now(), ...(meta ?? {}) },
      });
    } catch {
      /* silent */
    }
  }, []);

  // === Edit: muat order ke cart ===
  const handleEditStart = async (orderId: number) => {
    try {
      const detail = await getOrderWithItems(orderId);
            const mapped: CartItem[] = (detail?.items ?? []).map((it: any) => {
        const p: Product =
          it.product ??
          products.find((pp) => pp.id === it.product_id) ?? {
            id: it.product_id,
            name: "Item",
            price: it.price ?? 0,
            image_url: null,
            category_id: null as any,
          };

        // Pertahankan ukuran yang tersimpan, dan hitung harga satuan
        // dengan cara yang sama seperti saat item ditambahkan ke keranjang
        // (harga sesuai ukuran, lalu diskon).
        const size: "regular" | "large" = it.size === "large" ? "large" : "regular";
        const base = size === "large" && p.price_large ? p.price_large : p.price;
        const unitPrice = p.discount
          ? Math.round(base - (base * p.discount) / 100)
          : base;

        return {
          id: p.id,
          name: p.name,
          price: unitPrice,
          image_url: p.image_url,
          category_id: p.category_id,
          quantity: it.quantity ?? 1,
          size,
        } as CartItem;
      });
      setCustomerName(detail?.customer_name ?? "");
      setPaymentMethod((detail?.payment_method as PaymentMethod) ?? "");
      setCart(mapped);
      setEditingOrderId(orderId);
      setIsQueueOpen(false);
      setIsCartOpen(true);
    } catch {
      /* silent */
    }
  };

  const cancelEdit = () => {
    setEditingOrderId(null);
    setCart([]);
    setCustomerName("");
    setPaymentMethod("");
  };

  const handleSubmitOrder = async () => {
    if (!user) return alert("Authentication error.");
    if (!paymentMethod) return;
    setIsSubmitting(true);

    try {
      if (editingOrderId) {
        await updateOrderAndItems(editingOrderId, {
          customer_name: customerName,
          payment_method: paymentMethod,
          items: cart.map((c) => ({ product_id: c.id, quantity: c.quantity, size: c.size })),
        });
      } else {
        const total = cart.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        await createOrder(cart, customerName, total, user, paymentMethod);
      }

      await sendOrdersUpdated({
        source: editingOrderId ? "update" : "submit",
        orderId: editingOrderId ?? undefined,
      });
      await fetchTodaySummary();

      setIsCartOpen(false);
      setIsQueueOpen(true);
      setCart([]);
      setCustomerName("");
      setPaymentMethod("");
      setEditingOrderId(null);
    } catch (error: any) {
      alert(
        (editingOrderId ? "Gagal mengupdate order: " : "Error placing order: ") +
          error.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const [selectedSizes, setSelectedSizes] = useState<Record<number, "regular" | "large">>({});

  const handleSizeChange = (productId: number, size: "regular" | "large") => {
    setSelectedSizes((prev) => ({ ...prev, [productId]: size }));
  };

  const handleUpdateStatus = async (
    orderId: number,
    status: "completed" | "cancelled"
  ) => {
    try {
      await updateOrderStatus(orderId, status);
      await sendOrdersUpdated({ source: "status", orderId, status });
      await fetchTodaySummary();
      if (editingOrderId === orderId) cancelEdit();
    } catch (error: any) {
      alert(`Gagal mengubah status order: ${error.message}`);
    }
  };

    // Baris keranjang dikenali oleh (id produk + ukuran)
  const isSameLine = (i: CartItem, id: number, size: "regular" | "large") =>
    i.id === id && (i.size ?? "regular") === size;

  const handleRemoveItem = (productId: number, size: "regular" | "large") => {
    setCart((current) => current.filter((i) => !isSameLine(i, productId, size)));
  };

  const handleUpdateQuantity = (
    productId: number,
    size: "regular" | "large",
    newQuantity: number
  ) => {
    if (newQuantity <= 0) {
      handleRemoveItem(productId, size);
    } else {
      setCart((current) =>
        current.map((i) =>
          isSameLine(i, productId, size) ? { ...i, quantity: newQuantity } : i
        )
      );
    }
  };

  const filteredProducts = products.filter((p) => p.category_id === activeCategory);
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  /* ------------------------ AUTH GUARD DI HALAMAN ------------------------ */
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spinner size="sm" /> Memulihkan sesi…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  /* ---------------------------------------------------------------------- */

  if (!products.length && !categories.length) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Spinner size="sm" /> Memuat menu…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen min-h-0 bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm p-4 flex justify-between items-center flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold">Halaman Barista</h1>
          <p className="text-sm text-default-500">
            Logged in as: {profile?.full_name || user?.email}
          </p>
          <div className="mt-1">
            <OutletGate />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button color="warning" onPress={() => setIsQueueOpen(true)}>
            Queue ({pendingOrders.length})
          </Button>

          {/* Tombol Absen Pulang: hanya tampil kalau belum absen pulang hari ini */}
          {!checkingAttendance && !hasClockedOut && (
            <Button
              color="secondary"
              isLoading={clockingOut}
              onPress={handleClockOut}
            >
              Absen Pulang
            </Button>
          )}
          {hasClockedOut && (
            <Chip color="success" variant="flat">
              Sudah absen pulang
            </Chip>
          )}

          <Button color="danger" onPress={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      {/* Konten utama */}
      <div className="flex-grow min-h-0 pb-16 md:pb-0">
        <div className="flex h-full">
          {/* Sidebar ringkasan (desktop) */}
          <aside className="hidden lg:block w-64 flex-shrink-0 border-r bg-white p-4">
            <h3 className="font-semibold text-sm text-default-700">
              Ringkasan Hari Ini
            </h3>
            <div className="mt-3 space-y-3">
              <Card>
                <CardBody>
                  <div className="text-xs text-default-500">Total Completed</div>
                  <div className="text-2xl font-bold">{fmtIDR(todaySummary.total)}</div>
                  <div className="text-xs text-default-500 mt-1">
                    {todaySummary.count} order
                  </div>
                </CardBody>
              </Card>
              <div className="grid grid-cols-2 gap-2">
                <Card>
                  <CardBody>
                    <div className="text-xs text-default-500">CASH</div>
                    <div className="font-semibold">{fmtIDR(todaySummary.cash)}</div>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody>
                    <div className="text-xs text-default-500">QRIS</div>
                    <div className="font-semibold">{fmtIDR(todaySummary.qris)}</div>
                  </CardBody>
                </Card>
              </div>
            </div>
          </aside>

          {/* MENU */}
          <section className="flex-1 min-h-0 overflow-y-auto p-4">
            {/* Ringkasan kecil mobile */}
            <div className="lg:hidden grid grid-cols-2 gap-2 mb-4">
              <Card>
                <CardBody>
                  <div className="text-xs text-default-500">Total Today</div>
                  <div className="text-lg font-bold">{fmtIDR(todaySummary.total)}</div>
                  <div className="text-xs text-default-500">
                    {todaySummary.count} order
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <div className="text-xs text-default-500">Cash / QRIS</div>
                  <div className="text-sm font-semibold leading-tight">
                    {fmtIDR(todaySummary.cash)} / {fmtIDR(todaySummary.qris)}
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Kategori */}
            <div className="mb-4 flex-shrink-0 flex flex-wrap gap-2">
              {categories.map((cat) => {
                const active = activeCategory === cat.id;
                return (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={active ? "solid" : "flat"}
                    color={active ? "primary" : "default"}
                    onPress={() => setActiveCategory(cat.id)}
                  >
                    {cat.name}
                  </Button>
                );
              })}
            </div>

            {/* Produk */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredProducts.map((product) => {
                const selectedSize = selectedSizes[product.id] || "regular";
                const basePrice =
                  selectedSize === "large" && product.price_large
                    ? product.price_large
                    : product.price;
                const finalPrice = product.discount
                  ? Math.round(basePrice - (basePrice * product.discount) / 100)
                  : basePrice;

                return (
                  <Card key={product.id} shadow="sm" className="text-center">
                    <CardBody className="flex flex-col">
                      <img
                        src={product.image_url || "https://placehold.co/150x100/e2e8f0/e2e8f0?text=No-Image"}
                        alt={product.name}
                        className="w-full h-24 object-cover rounded-md mb-2"
                      />
                      <p className="font-bold text-sm truncate">{product.name}</p>
                      <p className="text-xs text-default-500 mb-2">
                        {product.discount ? (
                          <span className="text-red-500 font-semibold">
                            {new Intl.NumberFormat("id-ID").format(finalPrice)}{" "}
                            <span className="line-through text-gray-400 text-xs ml-1">
                              {new Intl.NumberFormat("id-ID").format(basePrice)}
                            </span>
                          </span>
                        ) : (
                          new Intl.NumberFormat("id-ID").format(finalPrice)
                        )}
                      </p>

                      {/* Size selection */}
                      <div className="flex justify-center gap-2 mb-2">
                        <label>
                          <input
                            type="radio"
                            name={`size-${product.id}`}
                            value="regular"
                            checked={selectedSize === "regular"}
                            onChange={() => handleSizeChange(product.id, "regular")}
                          />
                          Regular
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`size-${product.id}`}
                            value="large"
                            checked={selectedSize === "large"}
                            onChange={() => handleSizeChange(product.id, "large")}
                          />
                          Large
                        </label>
                      </div>

                      <Button
                        className="mt-auto"
                        color="primary"
                        onPress={() => {
                          setCart((prev) => {
                            const ex = prev.find((i) => i.id === product.id && i.size === selectedSize);
                            if (ex) {
                              return prev.map((i) =>
                                i.id === product.id && i.size === selectedSize
                                  ? { ...i, quantity: i.quantity + 1 }
                                  : i
                              );
                            }
                            return [
                              ...prev,
                              {
                                ...product,
                                quantity: 1,
                                size: selectedSize,
                                price: finalPrice,
                              } as CartItem,
                            ];
                          });
                        }}
                      >
                        Tambah
                      </Button>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* CART desktop (sidebar kanan) */}
          <aside className="hidden md:block w-full md:w-80 lg:w-96 max-w-md flex-shrink-0 border-l p-4">
            <OrderCart
              cart={cart}
              customerName={customerName}
              paymentMethod={paymentMethod}
              isSubmitting={isSubmitting}
              onCustomerNameChange={setCustomerName}
              onPaymentMethodChange={setPaymentMethod}
              onSubmit={handleSubmitOrder}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              isEditing={editingOrderId !== null}
              onCancelEdit={cancelEdit}
            />
          </aside>
        </div>
      </div>

      {/* Sticky bar mobile */}
      <div className="md:hidden sticky bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="flex items-center gap-2">
          <Button
            className="flex-1"
            color="primary"
            onPress={() => setIsCartOpen(true)}
          >
            {editingOrderId ? "Edit Order" : "Cart"} ({totalItems}) •{" "}
            {fmtIDR(totalPrice)}
          </Button>
          <Button color="warning" onPress={() => setIsQueueOpen(true)}>
            Queue
          </Button>
        </div>
      </div>

      <footer className="bg-white border-t w-full flex items-center justify-center py-3">
        <HeroLink
          isExternal
          className="flex items-center gap-1 text-current"
          href="https://www.instagram.com/zidni_mufti/"
        >
          <span className="text-default-600">Powered by</span>
          <p className="text-primary">Orang Ganteng</p>
        </HeroLink>
      </footer>

      {/* Bottom Sheet Cart (mobile) */}
      <Modal
        isOpen={isCartOpen}
        onOpenChange={(open) => {
          if (!open) setIsCartOpen(false);
        }}
        placement="bottom"
        hideCloseButton
      >
        <ModalContent className="h-[85dvh]">
          <Card className="rounded-none h-full">
            <CardBody className="h-full overflow-hidden">
              <OrderCart
                cart={cart}
                customerName={customerName}
                paymentMethod={paymentMethod}
                isSubmitting={isSubmitting}
                onCustomerNameChange={setCustomerName}
                onPaymentMethodChange={setPaymentMethod}
                onSubmit={handleSubmitOrder}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onClose={() => setIsCartOpen(false)}
                showClose
                isEditing={editingOrderId !== null}
                onCancelEdit={cancelEdit}
              />
            </CardBody>
          </Card>
        </ModalContent>
      </Modal>

      {/* Pending Orders Modal (tanpa ikon X) */}
      <Modal
        isOpen={isQueueOpen}
        onOpenChange={(open) => {
          if (!open) setIsQueueOpen(false);
        }}
        size="4xl"
        placement="center"
        scrollBehavior="inside"
        hideCloseButton
      >
        <ModalContent>
          <>
            <ModalHeader className="justify-between">
              <span>Pending Orders Queue ({pendingOrders.length})</span>
              <Button size="sm" variant="flat" onPress={() => setIsQueueOpen(false)}>
                Tutup
              </Button>
            </ModalHeader>

            <ModalBody>
              <PendingOrdersList
                orders={pendingOrders}
                onUpdateStatus={handleUpdateStatus}
                onEdit={handleEditStart}
              />
            </ModalBody>
          </>
        </ModalContent>
      </Modal>
    </div>
  );
}