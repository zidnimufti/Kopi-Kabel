// src/pages/admin/finance/calc.ts
// Perhitungan Laba/Rugi dan Cashflow (basis kas). Murni fungsi, tanpa UI.
//
// Aturan:
//  - Pendapatan penjualan = order berstatus completed (dari RPC finance_sales_daily).
//  - Pendapatan lain      = other_incomes dengan kind "pendapatan".
//  - Setoran modal        = other_incomes dengan kind "modal" (hanya Cashflow).
//  - HPP                  = pengeluaran dengan kategori bertanda is_cogs.
//  - Biaya operasional    = pengeluaran selain HPP.
//  - Tunai                = metode "cash" (atau kosong). Non-tunai = qris / transfer.

import type {
  CategoryMeta,
  Expense,
  OtherIncome,
  SalesDailyRow,
} from "@/api/FinanceApi";

const pad = (n: number) => String(n).padStart(2, "0");

export const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Daftar tanggal (yyyy-mm-dd) dari start sampai end, inklusif. Maks. 400 hari. */
export const eachDay = (start: string, end: string): string[] => {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cur = new Date(ys, ms - 1, ds);
  const last = new Date(ye, me - 1, de);
  const out: string[] = [];
  while (cur.getTime() <= last.getTime() && out.length < 400) {
    out.push(toInputDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

export interface DailyRow {
  day: string;
  income: number; // penjualan + pendapatan lain (tanpa modal)
  expense: number;
}

export interface CashDay {
  day: string;
  inCash: number;
  inNonCash: number;
  outCash: number;
  outNonCash: number;
  net: number;
  cumulative: number;
}

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface Report {
  // Laba / Rugi
  ordersCount: number;
  salesTotal: number;
  salesByMethod: { cash: number; qris: number; lain: number };
  salesByOutlet: Map<number | null, { orders: number; total: number }>;
  otherRevenue: number;
  revenue: number;
  cogs: number;
  cogsByCategory: CategoryTotal[];
  grossProfit: number;
  opex: number;
  opexByCategory: CategoryTotal[];
  totalExpense: number;
  netProfit: number;
  // Cashflow
  capital: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  inCash: number;
  inNonCash: number;
  outCash: number;
  outNonCash: number;
  cashDays: CashDay[];
  // Grafik
  daily: DailyRow[];
}

interface BuildInput {
  start: string;
  end: string;
  sales: SalesDailyRow[];
  expenses: Expense[];
  incomes: OtherIncome[];
  categories: CategoryMeta[];
}

const blankDay = () => ({
  income: 0,
  expense: 0,
  inCash: 0,
  inNonCash: 0,
  outCash: 0,
  outNonCash: 0,
});

const sortedTotals = (m: Map<string, number>): CategoryTotal[] =>
  Array.from(m.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

export function buildReport({
  start,
  end,
  sales,
  expenses,
  incomes,
  categories,
}: BuildInput): Report {
  const cogsNames = new Set(categories.filter((c) => c.is_cogs).map((c) => c.name));
  const days = eachDay(start, end);
  const dayMap = new Map<string, ReturnType<typeof blankDay>>();
  days.forEach((d) => dayMap.set(d, blankDay()));

  // ----- Penjualan -----
  let salesTotal = 0;
  let ordersCount = 0;
  const salesByMethod = { cash: 0, qris: 0, lain: 0 };
  const salesByOutlet = new Map<number | null, { orders: number; total: number }>();

  sales.forEach((r) => {
    salesTotal += r.total;
    ordersCount += r.orders_count;

    if (r.payment_method === "cash") salesByMethod.cash += r.total;
    else if (r.payment_method === "qris") salesByMethod.qris += r.total;
    else salesByMethod.lain += r.total;

    const o = salesByOutlet.get(r.outlet_id) ?? { orders: 0, total: 0 };
    o.orders += r.orders_count;
    o.total += r.total;
    salesByOutlet.set(r.outlet_id, o);

    const d = dayMap.get(r.day);
    if (d) {
      d.income += r.total;
      if (r.payment_method === "cash") d.inCash += r.total;
      else d.inNonCash += r.total;
    }
  });

  // ----- Pemasukan lain -----
  let otherRevenue = 0;
  let capital = 0;

  incomes.forEach((i) => {
    const isCash = (i.payment_method ?? "cash") === "cash";
    if (i.kind === "modal") capital += i.amount;
    else otherRevenue += i.amount;

    const d = dayMap.get(i.occurred_on);
    if (d) {
      if (i.kind !== "modal") d.income += i.amount;
      if (isCash) d.inCash += i.amount;
      else d.inNonCash += i.amount;
    }
  });

  // ----- Pengeluaran -----
  let cogs = 0;
  let opex = 0;
  const cogsMap = new Map<string, number>();
  const opexMap = new Map<string, number>();

  expenses.forEach((e) => {
    if (cogsNames.has(e.category)) {
      cogs += e.amount;
      cogsMap.set(e.category, (cogsMap.get(e.category) ?? 0) + e.amount);
    } else {
      opex += e.amount;
      opexMap.set(e.category, (opexMap.get(e.category) ?? 0) + e.amount);
    }

    const d = dayMap.get(e.occurred_on);
    if (d) {
      d.expense += e.amount;
      if ((e.payment_method ?? "cash") === "cash") d.outCash += e.amount;
      else d.outNonCash += e.amount;
    }
  });

  // ----- Laba / Rugi -----
  const revenue = salesTotal + otherRevenue;
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - opex;

  // ----- Cashflow -----
  let cumulative = 0;
  let inCash = 0;
  let inNonCash = 0;
  let outCash = 0;
  let outNonCash = 0;

  const cashDays: CashDay[] = days.map((day) => {
    const d = dayMap.get(day)!;
    const net = d.inCash + d.inNonCash - d.outCash - d.outNonCash;
    cumulative += net;
    inCash += d.inCash;
    inNonCash += d.inNonCash;
    outCash += d.outCash;
    outNonCash += d.outNonCash;
    return {
      day,
      inCash: d.inCash,
      inNonCash: d.inNonCash,
      outCash: d.outCash,
      outNonCash: d.outNonCash,
      net,
      cumulative,
    };
  });

  const cashIn = inCash + inNonCash;
  const cashOut = outCash + outNonCash;

  return {
    ordersCount,
    salesTotal,
    salesByMethod,
    salesByOutlet,
    otherRevenue,
    revenue,
    cogs,
    cogsByCategory: sortedTotals(cogsMap),
    grossProfit,
    opex,
    opexByCategory: sortedTotals(opexMap),
    totalExpense: cogs + opex,
    netProfit,
    capital,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    inCash,
    inNonCash,
    outCash,
    outNonCash,
    cashDays,
    daily: days.map((day) => {
      const d = dayMap.get(day)!;
      return { day, income: d.income, expense: d.expense };
    }),
  };
}