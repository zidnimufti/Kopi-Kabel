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