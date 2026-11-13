// src/api/FinanceApi.ts
// Pengganti penuh file lama. Semua fungsi lama tetap ada dengan nama yang sama.

import { supabase } from "./supabaseClient";

export type PayMethod = "cash" | "qris" | "transfer";

export interface Expense {
  id: number;
  occurred_on: string; // yyyy-mm-dd
  category: string;
  description: string | null;
  amount: number;
  payment_method: PayMethod | null;
}

/**
 * kind:
 *  - "pendapatan": pendapatan di luar penjualan -> masuk Laba/Rugi dan Cashflow
 *  - "modal"     : setoran modal / titipan       -> hanya Cashflow (bukan laba)
 */
export type IncomeKind = "pendapatan" | "modal";

export interface OtherIncome {
  id: number;
  occurred_on: string;
  source: string;
  description: string | null;
  amount: number;
  payment_method: PayMethod | null;
  kind: IncomeKind;
}

export type ExpenseInput = Omit<Expense, "id">;
export type OtherIncomeInput = Omit<OtherIncome, "id">;

export interface CategoryMeta {
  name: string;
  is_cogs: boolean;
}

/** Satu baris penjualan harian (order completed) per lantai dan metode bayar. */
export interface SalesDailyRow {
  day: string; // yyyy-mm-dd (WIB)
  outlet_id: number | null;
  payment_method: string | null;
  orders_count: number;
  total: number;
}

// ---------------------------------------------------------------------
// Penjualan (dihitung di server, hanya admin)
// ---------------------------------------------------------------------
export async function getSalesDaily(
  startDate: string,
  endDate: string,
): Promise<SalesDailyRow[]> {
  const { data, error } = await supabase.rpc("finance_sales_daily", {
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    day: String(r.day),
    outlet_id: r.outlet_id === null || r.outlet_id === undefined ? null : Number(r.outlet_id),
    payment_method: r.payment_method ?? null,
    orders_count: Number(r.orders_count),
    total: Number(r.total),
  }));
}

// ---------------------------------------------------------------------
// Pengeluaran
// ---------------------------------------------------------------------

/** Ambil pengeluaran dalam rentang tanggal (inklusif). */
export async function getExpenses(
  startDate: string,
  endDate: string,
): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function createExpense(payload: ExpenseInput): Promise<Expense> {
  const { data, error } = await supabase
    .from("expenses")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) };
}

export async function updateExpense(
  id: number,
  payload: Partial<ExpenseInput>,
): Promise<Expense> {
  const { data, error } = await supabase
    .from("expenses")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) };
}

export async function deleteExpense(id: number): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) throw error;
}

// ---------------------------------------------------------------------
// Pemasukan lain (non-penjualan)
// ---------------------------------------------------------------------
export async function getOtherIncomes(
  startDate: string,
  endDate: string,
): Promise<OtherIncome[]> {
  const { data, error } = await supabase
    .from("other_incomes")
    .select("*")
    .gte("occurred_on", startDate)
    .lte("occurred_on", endDate)
    .order("occurred_on", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    payment_method: row.payment_method ?? "cash",
    kind: row.kind ?? "pendapatan",
  }));
}

export async function createOtherIncome(
  payload: OtherIncomeInput,
): Promise<OtherIncome> {
  const { data, error } = await supabase
    .from("other_incomes")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) };
}

export async function updateOtherIncome(
  id: number,
  payload: Partial<OtherIncomeInput>,
): Promise<OtherIncome> {
  const { data, error } = await supabase
    .from("other_incomes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return { ...data, amount: Number(data.amount) };
}

export async function deleteOtherIncome(id: number): Promise<void> {
  const { error } = await supabase.from("other_incomes").delete().eq("id", id);

  if (error) throw error;
}

// ---------------------------------------------------------------------
// Kategori pengeluaran
// ---------------------------------------------------------------------
export async function getExpenseCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("name")
    .order("name");

  if (error) throw error;
  return (data ?? []).map((row) => row.name as string);
}

/** Kategori beserta penanda HPP (is_cogs). Bila kolom belum ada, semuanya dianggap non-HPP. */
export async function getExpenseCategoryMeta(): Promise<CategoryMeta[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("name, is_cogs")
    .order("name");

  if (error) {
    const names = await getExpenseCategories();
    return names.map((name) => ({ name, is_cogs: false }));
  }
  return (data ?? []).map((row: any) => ({
    name: row.name as string,
    is_cogs: !!row.is_cogs,
  }));
}

// ---------------------------------------------------------------------
// Pengaturan kategori: tandai kategori sebagai HPP atau Biaya Operasional
// ---------------------------------------------------------------------
export async function setCategoryCogs(name: string, isCogs: boolean): Promise<void> {
  const { error } = await supabase
    .from("expense_categories")
    .update({ is_cogs: isCogs })
    .eq("name", name);

  if (error) throw error;
}

// ---------------------------------------------------------------------
// HPP per menu
// ---------------------------------------------------------------------

/** Satu baris penjualan per menu dan ukuran (order completed). */
export interface ProductSalesRow {
  product_id: number;
  product_name: string;
  size: "regular" | "large";
  qty: number;
  revenue: number; // jumlah subtotal item (sudah setelah diskon)
  unit_cogs: number | null; // biaya per porsi; null = belum diisi
  /**
   * Asal biaya: "resep" (dari resep + harga bahan), "manual" (diisi manual),
   * "resep_tidak_lengkap" (resep ada tetapi ada bahan tanpa harga), atau null.
   */
  cost_source: "resep" | "manual" | "resep_tidak_lengkap" | null;
}

export interface ProductCost {
  product_id: number;
  cogs_regular: number | null;
  cogs_large: number | null;
}

/** Menu untuk form pengisian biaya. */
export interface ProductLite {
  id: number;
  name: string;
  price: number;
  price_large: number | null;
  discount: number | null;
}

export async function getSalesByProduct(
  startDate: string,
  endDate: string,
): Promise<ProductSalesRow[]> {
  const { data, error } = await supabase.rpc("finance_sales_by_product", {
    p_start: startDate,
    p_end: endDate,
  });
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    product_id: Number(r.product_id),
    product_name: String(r.product_name),
    size: r.size === "large" ? "large" : "regular",
    qty: Number(r.qty),
    revenue: Number(r.revenue),
    unit_cogs: r.unit_cogs === null || r.unit_cogs === undefined ? null : Number(r.unit_cogs),
    cost_source:
      r.cost_source === "resep" || r.cost_source === "manual" || r.cost_source === "resep_tidak_lengkap"
        ? r.cost_source
        : null,
  }));
}

export async function getProductCosts(): Promise<ProductCost[]> {
  const { data, error } = await supabase
    .from("product_costs")
    .select("product_id, cogs_regular, cogs_large");
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    product_id: Number(r.product_id),
    cogs_regular: r.cogs_regular === null ? null : Number(r.cogs_regular),
    cogs_large: r.cogs_large === null ? null : Number(r.cogs_large),
  }));
}

/** Menu aktif (belum dihapus) untuk form pengisian biaya. */
export async function getProductsLite(): Promise<ProductLite[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, price_large, discount, is_deleted")
    .order("name");
  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((p) => !p.is_deleted)
    .map((p) => ({
      id: Number(p.id),
      name: String(p.name),
      price: Number(p.price),
      price_large: p.price_large === null || p.price_large === undefined ? null : Number(p.price_large),
      discount: p.discount === null || p.discount === undefined ? null : Number(p.discount),
    }));
}

/** Simpan (upsert) biaya per porsi. Nilai null mengosongkan biaya. */
export async function saveProductCosts(rows: ProductCost[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("product_costs")
    .upsert(rows, { onConflict: "product_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Ekspor audit: rincian order & log penghapusan
// ---------------------------------------------------------------------

/** Satu baris per item order (order tanpa item tetap muncul satu baris dengan item_id null). */
export interface ExportOrderRow {
  order_id: number;
  created_wib: string; // "YYYY-MM-DDTHH:MM:SS" (WIB)
  status: string;
  source: string;
  outlet_id: number | null;
  payment_method: string | null;
  customer_name: string;
  table_number: string | null;
  total_amount: number;
  barista_name: string | null;
  handled_name: string | null;
  item_id: number | null;
  product_id: number | null;
  product_name: string | null;
  size: string | null;
  quantity: number | null;
  subtotal: number | null;
}

const numOrNull = (v: any): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * Ambil semua baris ekspor. API membatasi jumlah baris per jawaban, jadi data diambil
 * per halaman (500 baris) sampai habis.
 */
export async function getExportOrderRows(
  startDate: string,
  endDate: string,
): Promise<ExportOrderRow[]> {
  const PAGE = 500;
  const out: ExportOrderRow[] = [];

  for (let offset = 0; offset < 200000; offset += PAGE) {
    const { data, error } = await supabase.rpc("finance_export_orders", {
      p_start: startDate,
      p_end: endDate,
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) throw error;

    const rows = (data ?? []) as any[];
    rows.forEach((r) =>
      out.push({
        order_id: Number(r.order_id),
        created_wib: String(r.created_wib),
        status: String(r.status),
        source: String(r.source ?? "barista"),
        outlet_id: numOrNull(r.outlet_id),
        payment_method: r.payment_method ?? null,
        customer_name: String(r.customer_name ?? ""),
        table_number: r.table_number ?? null,
        total_amount: Number(r.total_amount ?? 0),
        barista_name: r.barista_name ?? null,
        handled_name: r.handled_name ?? null,
        item_id: numOrNull(r.item_id),
        product_id: numOrNull(r.product_id),
        product_name: r.product_name ?? null,
        size: r.size ?? null,
        quantity: numOrNull(r.quantity),
        subtotal: numOrNull(r.subtotal),
      }),
    );

    if (rows.length < PAGE) break;
  }
  return out;
}

/** Catatan order yang pernah dihapus (dari tabel orders_deleted_log, hanya terbaca admin). */
export interface DeletedOrderLogRow {
  order_id: number | null;
  deleted_at: string;
  deleted_by: string | null;
  customer_name: string | null;
  total_amount: number | null;
  status: string | null;
}

export async function getDeletedOrderLog(
  startDate: string,
  endDate: string,
): Promise<DeletedOrderLogRow[]> {
  // Batas waktu menurut WIB (UTC+7)
  const from = new Date(`${startDate}T00:00:00+07:00`);
  const to = new Date(`${endDate}T00:00:00+07:00`);
  to.setDate(to.getDate() + 1);

  const { data, error } = await supabase
    .from("orders_deleted_log")
    .select("order_id, deleted_at, deleted_by, order_data")
    .gte("deleted_at", from.toISOString())
    .lt("deleted_at", to.toISOString())
    .order("deleted_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    order_id: numOrNull(r.order_id),
    deleted_at: String(r.deleted_at),
    deleted_by: r.deleted_by ?? null,
    customer_name: r.order_data?.customer_name ?? null,
    total_amount: numOrNull(r.order_data?.total_amount),
    status: r.order_data?.status ?? null,
  }));
}