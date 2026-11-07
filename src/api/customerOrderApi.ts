// src/api/customerOrderApi.ts
// Pesanan dari pelanggan (tanpa login) ke antrean barista.
// Hanya data pilihan pelanggan yang dikirim; harga, diskon, total, dan status
// dihitung oleh fungsi database create_customer_order, bukan oleh browser.

import { supabase } from "./supabaseClient";

export interface CustomerOrderInput {
  outletId: number;
  customerName: string;
  tableNumber: string;
  paymentMethod: "cash" | "qris";
  items: { product_id: number; quantity: number; size: "regular" | "large" }[];
}

export interface CustomerOrderResult {
  orderId: number;
  total: number;
}

export async function createCustomerOrder(
  input: CustomerOrderInput,
): Promise<CustomerOrderResult> {
  const { data, error } = await supabase.rpc("create_customer_order", {
    p_outlet: input.outletId,
    p_customer: input.customerName.trim(),
    p_table: input.tableNumber.trim() || null,
    p_payment: input.paymentMethod,
    p_items: input.items,
  });

  if (error) {
    // Pesan dari fungsi database sudah berbahasa Indonesia dan aman ditampilkan.
    throw new Error(error.message || "Gagal menyimpan pesanan.");
  }

  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Server tidak mengembalikan nomor pesanan.");

  return { orderId: Number(row.order_id), total: Number(row.total) };
}