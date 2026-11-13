// src/pages/admin/finance/auditSpecs.ts
// Membuat isi file Excel "paket audit" (murni fungsi, tanpa library Excel).
//
// Tujuan: bisa diperiksa OFFLINE. Setiap total pada sheet ringkasan memakai RUMUS Excel
// yang merujuk ke sheet rinci (bukan angka mati), dan sheet "Cek Silang" membandingkan
// angka dari sumber yang berbeda sehingga selisih langsung terlihat.
//
// Setiap sel rumus juga membawa nilai hitungan awal (cached) supaya tetap terbaca di
// aplikasi pembuka file yang tidak menghitung ulang rumus.

import type {
  CategoryMeta,
  DeletedOrderLogRow,
  Expense,
  ExportOrderRow,
  OtherIncome,
  ProductSalesRow,
  SalesDailyRow,
} from "@/api/FinanceApi";
import { buildProductReport, type Report } from "./calc";

// ===== Tipe =====
export type CellValue = string | number | null;
export interface CellObj {
  v: CellValue;
  f?: string; // rumus Excel tanpa tanda "="
  z?: string; // format angka
}
export type Cell = CellValue | CellObj;

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  colWidths?: number[];
  autofilter?: string; // mis. "A1:F20"
}

export interface AuditInput {
  start: string;
  end: string;
  exportedAt: string; // "YYYY-MM-DD HH:MM:SS" (WIB)
  report: Report;
  sales: SalesDailyRow[];
  expenses: Expense[];
  incomes: OtherIncome[];
  categories: CategoryMeta[];
  /** null = data rinci order tidak tersedia (sheet Order & Item Order dilewati) */
  orders: ExportOrderRow[] | null;
  /** null = penjualan per menu tidak tersedia (sheet HPP per Menu dilewati) */
  productSales: ProductSalesRow[] | null;
  /** null = log penghapusan tidak tersedia */
  deletedLog: DeletedOrderLogRow[] | null;
  outletName: (id: number | null) => string;
  /** catatan yang akan ditulis di sheet Info (mis. sheet yang gagal dibuat) */
  warnings: string[];
}

// ===== Konstanta =====
const RP = "#,##0";
const PCT = "0.0%";

export const SHEET = {
  info: "Info",
  check: "Cek Silang",
  pl: "Laba Rugi",
  cat: "Ringkasan Kategori",
  exp: "Pengeluaran Detail",
  inc: "Pemasukan Lain",
  menu: "HPP per Menu",
  cash: "Cashflow",
  sales: "Penjualan Harian",
  floor: "Penjualan per Lantai",
  orders: "Order",
  items: "Item Order",
  del: "Log Hapus Order",
} as const;

/** Baris "TOTAL PENDAPATAN" di sheet Laba Rugi. Tetap, karena dirujuk dari sheet lain. */
const PL_REV_ROW = 9;

// ===== Helper =====
const q = (name: string) => `'${name}'`;

/** Rentang kolom data (baris 2..n+1) dengan nama sheet, mis. 'Pengeluaran Detail'!$F$2:$F$10 */
const rng = (sheet: string, col: string, n: number) =>
  `${q(sheet)}!$${col}$2:$${col}$${Math.max(2, n + 1)}`;

const fx = (f: string, v: CellValue, z?: string): CellObj => ({ v, f, z });
const rp = (v: number): CellObj => ({ v, z: RP });

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const METHOD: Record<string, string> = { cash: "Tunai", qris: "QRIS", transfer: "Transfer" };
const methodLabel = (m: string | null | undefined) => METHOD[m ?? "cash"] ?? String(m);
const salesMethodLabel = (m: string | null | undefined) =>
  m === "cash" ? "Tunai" : m === "qris" ? "QRIS" : "Lainnya";

const waktu = (iso: string) => iso.replace("T", " ").slice(0, 19);

const wibFromIso = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });

// =====================================================================
export function buildAuditSpecs(input: AuditInput): SheetSpec[] {
  const { start, end, report, categories, outletName } = input;

  const cogsNames = new Set(categories.filter((c) => c.is_cogs).map((c) => c.name));

  const expenses = [...input.expenses].sort(
    (a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id - b.id,
  );
  const incomes = [...input.incomes].sort(
    (a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id - b.id,
  );
  const sales = [...input.sales].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.outlet_id ?? 0) - (b.outlet_id ?? 0) ||
      String(a.payment_method).localeCompare(String(b.payment_method)),
  );

  const nExp = expenses.length;
  const nInc = incomes.length;
  const nSales = sales.length;

  const expTotal = sum(expenses.map((e) => e.amount));
  const salesTotalSheet = sum(sales.map((s) => s.total));
  const salesCountSheet = sum(sales.map((s) => s.orders_count));
  const incPendapatan = sum(incomes.filter((i) => i.kind !== "modal").map((i) => i.amount));
  const incAll = sum(incomes.map((i) => i.amount));

  // ----- Daftar kategori (termasuk yang nol), dipisah HPP / Operasional -----
  const allCats = new Set<string>();
  categories.forEach((c) => allCats.add(c.name));
  expenses.forEach((e) => allCats.add(e.category));
  const hppCats = [...allCats].filter((c) => cogsNames.has(c)).sort((a, b) => a.localeCompare(b));
  const opexCats = [...allCats].filter((c) => !cogsNames.has(c)).sort((a, b) => a.localeCompare(b));
  const catTotal = (c: string) => sum(expenses.filter((e) => e.category === c).map((e) => e.amount));
  const catCount = (c: string) => expenses.filter((e) => e.category === c).length;

  // =====================================================================
  // Sheet: Pengeluaran Detail
  // =====================================================================
  const expRows: Cell[][] = [
    ["Tanggal", "Kelompok", "Kategori", "Keterangan", "Metode", "Nominal (Rp)"],
  ];
  expenses.forEach((e) =>
    expRows.push([
      e.occurred_on,
      cogsNames.has(e.category) ? "HPP" : "Operasional",
      e.category,
      e.description ?? "",
      methodLabel(e.payment_method),
      rp(e.amount),
    ]),
  );
  expRows.push([]);
  expRows.push(["TOTAL", null, null, null, null, fx(`SUM(${rng(SHEET.exp, "F", nExp)})`, expTotal, RP)]);
  const expSheet: SheetSpec = {
    name: SHEET.exp,
    rows: expRows,
    colWidths: [12, 14, 20, 40, 11, 16],
    autofilter: `A1:F${Math.max(2, nExp + 1)}`,
  };

  // =====================================================================
  // Sheet: Pemasukan Lain
  // =====================================================================
  const incRows: Cell[][] = [
    ["Tanggal", "Sumber", "Jenis", "Keterangan", "Metode", "Nominal (Rp)"],
  ];
  incomes.forEach((i) =>
    incRows.push([
      i.occurred_on,
      i.source,
      i.kind === "modal" ? "Modal" : "Pendapatan",
      i.description ?? "",
      methodLabel(i.payment_method),
      rp(i.amount),
    ]),
  );
  incRows.push([]);
  incRows.push(["TOTAL", null, null, null, null, fx(`SUM(${rng(SHEET.inc, "F", nInc)})`, incAll, RP)]);
  const incSheet: SheetSpec = {
    name: SHEET.inc,
    rows: incRows,
    colWidths: [12, 28, 12, 40, 11, 16],
    autofilter: `A1:F${Math.max(2, nInc + 1)}`,
  };

  // =====================================================================
  // Sheet: Penjualan Harian
  // =====================================================================
  const salesRows: Cell[][] = [
    ["Tanggal", "Lantai", "Metode", "Jumlah Order", "Total (Rp)"],
  ];
  sales.forEach((s) =>
    salesRows.push([
      s.day,
      outletName(s.outlet_id),
      salesMethodLabel(s.payment_method),
      s.orders_count,
      rp(s.total),
    ]),
  );
  salesRows.push([]);
  salesRows.push([
    "TOTAL",
    null,
    null,
    fx(`SUM(${rng(SHEET.sales, "D", nSales)})`, salesCountSheet),
    fx(`SUM(${rng(SHEET.sales, "E", nSales)})`, salesTotalSheet, RP),
  ]);
  const salesSheet: SheetSpec = {
    name: SHEET.sales,
    rows: salesRows,
    colWidths: [12, 20, 12, 14, 16],
    autofilter: `A1:E${Math.max(2, nSales + 1)}`,
  };

  // =====================================================================
  // Sheet: Penjualan per Lantai
  // =====================================================================
  const outletIds: (number | null)[] = [];
  sales.forEach((s) => {
    if (!outletIds.includes(s.outlet_id)) outletIds.push(s.outlet_id);
  });
  outletIds.sort((a, b) => (a ?? 9999) - (b ?? 9999));

  const floorRows: Cell[][] = [["Lantai", "Jumlah Order", "Total (Rp)"]];
  outletIds.forEach((id, i) => {
    const r = i + 2;
    const name = outletName(id);
    const mine = sales.filter((s) => s.outlet_id === id);
    floorRows.push([
      name,
      fx(`SUMIFS(${rng(SHEET.sales, "D", nSales)},${rng(SHEET.sales, "B", nSales)},$A${r})`, sum(mine.map((s) => s.orders_count))),
      fx(`SUMIFS(${rng(SHEET.sales, "E", nSales)},${rng(SHEET.sales, "B", nSales)},$A${r})`, sum(mine.map((s) => s.total)), RP),
    ]);
  });
  const nFloor = outletIds.length;
  floorRows.push([]);
  floorRows.push([
    "TOTAL",
    fx(`SUM(B2:B${Math.max(2, nFloor + 1)})`, salesCountSheet),
    fx(`SUM(C2:C${Math.max(2, nFloor + 1)})`, salesTotalSheet, RP),
  ]);
  const floorSheet: SheetSpec = { name: SHEET.floor, rows: floorRows, colWidths: [24, 14, 16] };

  // =====================================================================
  // Sheet: Ringkasan Kategori  (HPP & Operasional)
  // Letak baris dihitung di muka karena dirujuk oleh sheet Laba Rugi.
  // =====================================================================
  const hppFirst = 2;
  const hppLast = 1 + hppCats.length;
  const hppSubRow = hppLast + 1;
  const opexFirst = hppSubRow + 2; // satu baris kosong
  const opexLast = opexFirst - 1 + opexCats.length;
  const opexSubRow = opexLast + 1;
  const catTotalRow = opexSubRow + 2; // satu baris kosong

  const plRev = `${q(SHEET.pl)}!$B$${PL_REV_ROW}`;
  const cogsAll = sum(hppCats.map(catTotal));
  const opexAll = sum(opexCats.map(catTotal));

  const catRows: Cell[][] = [
    ["Kelompok", "Kategori", "Jumlah Transaksi", "Total (Rp)", "% dari Kelompok", "% dari Pendapatan"],
  ];

  const addCatLine = (group: string, c: string, subRow: number, groupTotal: number) => {
    const r = catRows.length + 1;
    const t = catTotal(c);
    catRows.push([
      group,
      c,
      fx(`COUNTIFS(${rng(SHEET.exp, "C", nExp)},$B${r})`, catCount(c)),
      fx(`SUMIFS(${rng(SHEET.exp, "F", nExp)},${rng(SHEET.exp, "C", nExp)},$B${r})`, t, RP),
      fx(`IF($D$${subRow}=0,0,D${r}/$D$${subRow})`, groupTotal === 0 ? 0 : t / groupTotal, PCT),
      fx(`IF(${plRev}=0,0,D${r}/${plRev})`, report.revenue === 0 ? 0 : t / report.revenue, PCT),
    ]);
  };
  const addSubLine = (label: string, first: number, last: number, count: number, total: number) => {
    const r = catRows.length + 1;
    const has = last >= first;
    catRows.push([
      label,
      null,
      fx(has ? `SUM(C${first}:C${last})` : "0", count),
      fx(has ? `SUM(D${first}:D${last})` : "0", total, RP),
      null,
      fx(`IF(${plRev}=0,0,D${r}/${plRev})`, report.revenue === 0 ? 0 : total / report.revenue, PCT),
    ]);
  };

  hppCats.forEach((c) => addCatLine("HPP", c, hppSubRow, cogsAll));
  addSubLine("SUBTOTAL HPP", hppFirst, hppLast, sum(hppCats.map(catCount)), cogsAll);
  catRows.push([]);
  opexCats.forEach((c) => addCatLine("Operasional", c, opexSubRow, opexAll));
  addSubLine("SUBTOTAL BIAYA OPERASIONAL", opexFirst, opexLast, sum(opexCats.map(catCount)), opexAll);
  catRows.push([]);
  catRows.push([
    "TOTAL PENGELUARAN",
    null,
    fx(`C${hppSubRow}+C${opexSubRow}`, nExp),
    fx(`D${hppSubRow}+D${opexSubRow}`, cogsAll + opexAll, RP),
    null,
    fx(`IF(${plRev}=0,0,D${catTotalRow}/${plRev})`, report.revenue === 0 ? 0 : (cogsAll + opexAll) / report.revenue, PCT),
  ]);
  const catSheet: SheetSpec = {
    name: SHEET.cat,
    rows: catRows,
    colWidths: [30, 22, 18, 16, 16, 18],
  };

  // =====================================================================
  // Sheet: Laba Rugi
  // =====================================================================
  const plRows: Cell[][] = [];
  plRows.push(["LAPORAN LABA / RUGI — Kopi Kabel"]); // 1
  plRows.push([`Periode: ${start} s/d ${end}`]); // 2
  plRows.push([]); // 3
  plRows.push(["URAIAN", "NOMINAL (Rp)", "SUMBER / KETERANGAN"]); // 4
  plRows.push([
    "Penjualan (order Completed)",
    fx(`SUM(${rng(SHEET.sales, "E", nSales)})`, report.salesTotal, RP),
    `Sheet "${SHEET.sales}" (dihitung server dari order berstatus completed)`,
  ]); // 5
  plRows.push([
    "   Tunai",
    fx(`SUMIFS(${rng(SHEET.sales, "E", nSales)},${rng(SHEET.sales, "C", nSales)},"Tunai")`, report.salesByMethod.cash, RP),
    `Sheet "${SHEET.sales}"`,
  ]); // 6
  plRows.push([
    "   QRIS",
    fx(`SUMIFS(${rng(SHEET.sales, "E", nSales)},${rng(SHEET.sales, "C", nSales)},"QRIS")`, report.salesByMethod.qris, RP),
    `Sheet "${SHEET.sales}"`,
  ]); // 7
  plRows.push([
    "Pendapatan lain",
    fx(`SUMIFS(${rng(SHEET.inc, "F", nInc)},${rng(SHEET.inc, "C", nInc)},"Pendapatan")`, report.otherRevenue, RP),
    `Sheet "${SHEET.inc}", jenis Pendapatan (setoran Modal tidak dihitung)`,
  ]); // 8
  plRows.push([
    "TOTAL PENDAPATAN",
    fx("B5+B8", report.revenue, RP),
    "Penjualan + pendapatan lain",
  ]); // 9 = PL_REV_ROW
  plRows.push([]); // 10
  plRows.push(["HPP (Harga Pokok Penjualan)"]); // 11
  hppCats.forEach((c, i) =>
    plRows.push([
      `   ${c}`,
      fx(`${q(SHEET.cat)}!$D$${hppFirst + i}`, catTotal(c), RP),
      `Sheet "${SHEET.cat}"`,
    ]),
  );
  const plHppTotalRow = plRows.length + 1;
  plRows.push([
    "TOTAL HPP",
    fx(`${q(SHEET.cat)}!$D$${hppSubRow}`, report.cogs, RP),
    "Pengeluaran berkategori HPP (kas keluar), bukan pemakaian bahan",
  ]);
  const plGrossRow = plRows.length + 1;
  plRows.push([
    "LABA KOTOR",
    fx(`B${PL_REV_ROW}-B${plHppTotalRow}`, report.grossProfit, RP),
    "Total pendapatan − HPP",
  ]);
  plRows.push([]);
  plRows.push(["Biaya Operasional"]);
  opexCats.forEach((c, i) =>
    plRows.push([
      `   ${c}`,
      fx(`${q(SHEET.cat)}!$D$${opexFirst + i}`, catTotal(c), RP),
      `Sheet "${SHEET.cat}"`,
    ]),
  );
  const plOpexTotalRow = plRows.length + 1;
  plRows.push([
    "TOTAL BIAYA OPERASIONAL",
    fx(`${q(SHEET.cat)}!$D$${opexSubRow}`, report.opex, RP),
    "Pengeluaran selain HPP",
  ]);
  const plNetRow = plRows.length + 1;
  plRows.push([
    "LABA / RUGI BERSIH",
    fx(`B${plGrossRow}-B${plOpexTotalRow}`, report.netProfit, RP),
    "Laba kotor − biaya operasional",
  ]);
  plRows.push([]);
  plRows.push([
    "Margin laba kotor",
    fx(`IF(B${PL_REV_ROW}>0,B${plGrossRow}/B${PL_REV_ROW},"")`, report.revenue > 0 ? report.grossProfit / report.revenue : "", PCT),
  ]);
  plRows.push([
    "Margin laba bersih",
    fx(`IF(B${PL_REV_ROW}>0,B${plNetRow}/B${PL_REV_ROW},"")`, report.revenue > 0 ? report.netProfit / report.revenue : "", PCT),
  ]);
  plRows.push([]);
  plRows.push(["Catatan:"]);
  plRows.push(["- Basis kas: penjualan dihitung saat order berstatus Completed (waktu WIB)."]);
  plRows.push(["- Setoran modal tidak termasuk pendapatan; hanya muncul di Cashflow."]);
  plRows.push(["- HPP di sini = pembelian bahan (pengeluaran). HPP menurut menu ada di sheet HPP per Menu."]);
  const plSheet: SheetSpec = { name: SHEET.pl, rows: plRows, colWidths: [34, 18, 70] };

  // =====================================================================
  // Sheet: Cashflow
  // =====================================================================
  const cashDays = report.cashDays;
  const nCash = cashDays.length;
  const cashRows: Cell[][] = [
    ["Tanggal", "Masuk Tunai", "Masuk Non-tunai", "Keluar Tunai", "Keluar Non-tunai", "Netto", "Saldo Kumulatif"],
  ];
  cashDays.forEach((d, i) => {
    const r = i + 2;
    cashRows.push([
      d.day,
      rp(d.inCash),
      rp(d.inNonCash),
      rp(d.outCash),
      rp(d.outNonCash),
      fx(`B${r}+C${r}-D${r}-E${r}`, d.net, RP),
      fx(i === 0 ? `F${r}` : `G${r - 1}+F${r}`, d.cumulative, RP),
    ]);
  });
  cashRows.push([]);
  const cashTotalRow = nCash + 3;
  const lastCash = Math.max(2, nCash + 1);
  cashRows.push([
    "TOTAL",
    fx(`SUM(B2:B${lastCash})`, report.inCash, RP),
    fx(`SUM(C2:C${lastCash})`, report.inNonCash, RP),
    fx(`SUM(D2:D${lastCash})`, report.outCash, RP),
    fx(`SUM(E2:E${lastCash})`, report.outNonCash, RP),
    fx(`SUM(F2:F${lastCash})`, report.netCash, RP),
    fx(`G${lastCash}`, report.netCash, RP),
  ]);
  cashRows.push([]);
  cashRows.push(["Catatan: Non-tunai = QRIS dan transfer. Termasuk setoran modal. Saldo kumulatif dimulai dari 0 pada tanggal mulai."]);
  const cashSheet: SheetSpec = {
    name: SHEET.cash,
    rows: cashRows,
    colWidths: [12, 16, 18, 16, 18, 16, 18],
    autofilter: `A1:G${lastCash}`,
  };

  // =====================================================================
  // Sheet: HPP per Menu (opsional)
  // =====================================================================
  let menuSheet: SheetSpec | null = null;
  if (input.productSales) {
    const pr = buildProductReport(input.productSales);
    const menuRows: Cell[][] = [
      [
        "Menu", "Terjual Reg", "Terjual Large", "Terjual Total", "Pendapatan (Rp)",
        "Biaya/porsi Reg", "Biaya/porsi Large", "Pendapatan (biaya terisi)",
        "HPP Total", "Laba Kotor", "Margin", "Status Biaya", "Sumber Biaya",
      ],
    ];
    pr.rows.forEach((row, i) => {
      const r = i + 2;
      menuRows.push([
        row.name,
        row.qtyRegular,
        row.qtyLarge,
        fx(`B${r}+C${r}`, row.qty),
        rp(row.revenue),
        row.unitRegular === null ? null : rp(row.unitRegular),
        row.unitLarge === null ? null : rp(row.unitLarge),
        rp(row.revenueKnown),
        fx(`IF(F${r}="",0,B${r}*F${r})+IF(G${r}="",0,C${r}*G${r})`, row.cogsTotal, RP),
        fx(`H${r}-I${r}`, row.grossProfit, RP),
        fx(`IF(H${r}>0,J${r}/H${r},"")`, row.margin === null ? "" : row.margin / 100, PCT),
        row.complete ? "Lengkap" : row.missingAll ? "Belum diisi" : "Sebagian",
        row.source === "resep"
          ? "Resep"
          : row.source === "manual"
            ? "Manual"
            : row.source === "campur"
              ? "Resep + manual"
              : row.recipeIncomplete
                ? "Resep belum lengkap"
                : "—",
      ]);
    });
    const nMenu = pr.rows.length;
    const lastMenu = Math.max(2, nMenu + 1);
    const mt = nMenu + 3;
    menuRows.push([]);
    menuRows.push([
      "TOTAL",
      fx(`SUM(B2:B${lastMenu})`, sum(pr.rows.map((r) => r.qtyRegular))),
      fx(`SUM(C2:C${lastMenu})`, sum(pr.rows.map((r) => r.qtyLarge))),
      fx(`SUM(D2:D${lastMenu})`, sum(pr.rows.map((r) => r.qty))),
      fx(`SUM(E2:E${lastMenu})`, pr.totalRevenue, RP),
      null,
      null,
      fx(`SUM(H2:H${lastMenu})`, pr.revenueKnown, RP),
      fx(`SUM(I2:I${lastMenu})`, pr.cogsTheoretical, RP),
      fx(`SUM(J2:J${lastMenu})`, pr.grossTheoretical, RP),
      fx(`IF(H${mt}>0,J${mt}/H${mt},"")`, pr.marginTheoretical === null ? "" : pr.marginTheoretical / 100, PCT),
      null,
    ]);
    menuRows.push([]);
    menuRows.push([
      "Cakupan biaya (pendapatan yang biayanya sudah diisi)",
      null, null, null, null, null, null,
      fx(`IF(E${mt}>0,H${mt}/E${mt},0)`, pr.totalRevenue > 0 ? pr.revenueKnown / pr.totalRevenue : 0, PCT),
    ]);
    menuRows.push([
      "HPP menurut pembelian bahan (sheet Laba Rugi)",
      null, null, null, null, null, null, null,
      fx(`${q(SHEET.pl)}!$B$${plHppTotalRow}`, report.cogs, RP),
    ]);
    menuRows.push([
      "Selisih pembelian bahan − HPP menu",
      null, null, null, null, null, null, null,
      fx(`I${mt + 3}-I${mt}`, report.cogs - pr.cogsTheoretical, RP),
    ]);
    menuRows.push([]);
    menuRows.push(["Catatan: pendapatan dihitung setelah diskon. Margin hanya dari ukuran yang biayanya sudah diisi."]);
    menuRows.push(["Sumber biaya: Resep = dari resep dan harga bahan saat ini; Manual = biaya per porsi yang diisi manual. Biaya memakai harga saat ekspor, bukan harga saat penjualan."]);
    menuRows.push(["Selisih terhadap pembelian bahan wajar: pembelian ≠ pemakaian (stok, bahan terbuang, menu belum diisi)."]);
    menuSheet = {
      name: SHEET.menu,
      rows: menuRows,
      colWidths: [30, 12, 13, 13, 16, 15, 16, 22, 15, 15, 10, 14, 20],
      autofilter: `A1:M${lastMenu}`,
    };
  }

  // =====================================================================
  // Sheet: Order & Item Order (opsional)
  // =====================================================================
  let orderSheet: SheetSpec | null = null;
  let itemSheet: SheetSpec | null = null;
  let nOrders = 0;
  let nItems = 0;
  let ordersCompletedTotal = 0;
  let ordersCompletedCount = 0;
  let itemsCompletedSubtotal = 0;

  if (input.orders) {
    const byOrder = new Map<number, ExportOrderRow[]>();
    input.orders.forEach((r) => {
      const list = byOrder.get(r.order_id) ?? [];
      list.push(r);
      byOrder.set(r.order_id, list);
    });

    const orderRows: Cell[][] = [
      [
        "ID Order", "Waktu (WIB)", "Status", "Sumber", "Lantai", "Metode", "Nama Pelanggan",
        "Meja", "Total (Rp)", "Dibuat oleh", "Diproses oleh", "Jumlah Item",
      ],
    ];
    const itemRows: Cell[][] = [["ID Order", "Status", "Menu", "Ukuran", "Qty", "Subtotal (Rp)"]];

    Array.from(byOrder.keys())
      .sort((a, b) => a - b)
      .forEach((id) => {
        const rowsOfOrder = byOrder.get(id) as ExportOrderRow[];
        const o = rowsOfOrder[0];
        const items = rowsOfOrder.filter((r) => r.item_id !== null);

        orderRows.push([
          id,
          waktu(o.created_wib),
          o.status,
          o.source === "web" ? "Web" : "Barista",
          outletName(o.outlet_id),
          o.payment_method ? methodLabel(o.payment_method) : "",
          o.customer_name,
          o.table_number ?? "",
          rp(o.total_amount),
          o.barista_name ?? "",
          o.handled_name ?? "",
          items.length,
        ]);

        if (o.status === "completed") {
          ordersCompletedTotal += o.total_amount;
          ordersCompletedCount += 1;
        }

        items.forEach((it) => {
          itemRows.push([
            id,
            o.status,
            it.product_name ?? "",
            it.size ?? "regular",
            it.quantity ?? 0,
            rp(it.subtotal ?? 0),
          ]);
          if (o.status === "completed") itemsCompletedSubtotal += it.subtotal ?? 0;
        });
      });

    nOrders = orderRows.length - 1;
    nItems = itemRows.length - 1;

    orderSheet = {
      name: SHEET.orders,
      rows: orderRows,
      colWidths: [10, 20, 11, 10, 14, 10, 24, 8, 14, 18, 18, 12],
      autofilter: `A1:L${Math.max(2, nOrders + 1)}`,
    };
    itemSheet = {
      name: SHEET.items,
      rows: itemRows,
      colWidths: [10, 11, 32, 9, 7, 15],
      autofilter: `A1:F${Math.max(2, nItems + 1)}`,
    };
  }

  // =====================================================================
  // Sheet: Log Hapus Order (opsional)
  // =====================================================================
  let delSheet: SheetSpec | null = null;
  if (input.deletedLog) {
    const delRows: Cell[][] = [
      ["Waktu Hapus (WIB)", "ID Order", "Nama Pelanggan", "Status Terakhir", "Total (Rp)", "Dihapus oleh (ID pengguna)"],
    ];
    input.deletedLog.forEach((d) =>
      delRows.push([
        wibFromIso(d.deleted_at),
        d.order_id,
        d.customer_name ?? "",
        d.status ?? "",
        d.total_amount === null ? null : rp(d.total_amount),
        d.deleted_by ?? "(SQL Editor / sistem)",
      ]),
    );
    if (input.deletedLog.length === 0) delRows.push(["Tidak ada order yang dihapus pada periode ini."]);
    delSheet = {
      name: SHEET.del,
      rows: delRows,
      colWidths: [20, 10, 24, 15, 14, 40],
    };
  }

  // =====================================================================
  // Sheet: Cek Silang
  // =====================================================================
  const checkRows: Cell[][] = [
    ["Pemeriksaan", "Nilai 1", "Nilai 2", "Selisih", "Status"],
  ];
  const checkResults: boolean[] = [];

  const addCheck = (label: string, f1: string, v1: number, f2: string, v2: number) => {
    const r = checkRows.length + 1;
    const diff = v1 - v2;
    const ok = Math.abs(diff) < 0.5;
    checkResults.push(ok);
    checkRows.push([
      label,
      fx(f1, v1, RP),
      fx(f2, v2, RP),
      fx(`B${r}-C${r}`, diff, RP),
      fx(`IF(ABS(D${r})<0.5,"OK","BEDA")`, ok ? "OK" : "BEDA"),
    ]);
  };

  if (input.orders) {
    addCheck(
      "Penjualan: total sheet Penjualan Harian vs total order Completed (sheet Order)",
      `SUM(${rng(SHEET.sales, "E", nSales)})`, salesTotalSheet,
      `SUMIFS(${rng(SHEET.orders, "I", nOrders)},${rng(SHEET.orders, "C", nOrders)},"completed")`, ordersCompletedTotal,
    );
    addCheck(
      "Jumlah order Completed: Penjualan Harian vs sheet Order",
      `SUM(${rng(SHEET.sales, "D", nSales)})`, salesCountSheet,
      `COUNTIFS(${rng(SHEET.orders, "C", nOrders)},"completed")`, ordersCompletedCount,
    );
    addCheck(
      "Total order Completed vs jumlah subtotal item order Completed",
      `SUMIFS(${rng(SHEET.orders, "I", nOrders)},${rng(SHEET.orders, "C", nOrders)},"completed")`, ordersCompletedTotal,
      `SUMIFS(${rng(SHEET.items, "F", nItems)},${rng(SHEET.items, "B", nItems)},"completed")`, itemsCompletedSubtotal,
    );
  }
  addCheck(
    "Total pengeluaran: sheet Pengeluaran Detail vs Ringkasan Kategori",
    `SUM(${rng(SHEET.exp, "F", nExp)})`, expTotal,
    `${q(SHEET.cat)}!$D$${catTotalRow}`, cogsAll + opexAll,
  );
  addCheck(
    "Total pengeluaran: Laba Rugi (HPP + Operasional) vs Pengeluaran Detail",
    `${q(SHEET.pl)}!$B$${plHppTotalRow}+${q(SHEET.pl)}!$B$${plOpexTotalRow}`, report.cogs + report.opex,
    `SUM(${rng(SHEET.exp, "F", nExp)})`, expTotal,
  );
  addCheck(
    "Pemasukan lain (jenis Pendapatan): sheet Pemasukan Lain vs Laba Rugi",
    `SUMIFS(${rng(SHEET.inc, "F", nInc)},${rng(SHEET.inc, "C", nInc)},"Pendapatan")`, incPendapatan,
    `${q(SHEET.pl)}!$B$8`, report.otherRevenue,
  );
  addCheck(
    "Cashflow netto vs (penjualan + pemasukan lain + modal − pengeluaran)",
    `${q(SHEET.cash)}!$F$${cashTotalRow}`, report.netCash,
    `SUM(${rng(SHEET.sales, "E", nSales)})+SUM(${rng(SHEET.inc, "F", nInc)})-SUM(${rng(SHEET.exp, "F", nExp)})`,
    salesTotalSheet + incAll - expTotal,
  );
  addCheck(
    "Laba bersih: Laba Rugi vs (total pendapatan − total pengeluaran)",
    `${q(SHEET.pl)}!$B$${plNetRow}`, report.netProfit,
    `${q(SHEET.pl)}!$B$${PL_REV_ROW}-SUM(${rng(SHEET.exp, "F", nExp)})`, report.revenue - expTotal,
  );

  const lastCheck = checkRows.length;
  const allOk = checkResults.every(Boolean);
  checkRows.push([]);
  checkRows.push([
    "HASIL KESELURUHAN",
    null,
    null,
    null,
    fx(
      `IF(COUNTIF(E2:E${lastCheck},"BEDA")=0,"SEMUA OK","ADA SELISIH")`,
      allOk ? "SEMUA OK" : "ADA SELISIH",
    ),
  ]);
  checkRows.push([]);
  checkRows.push(["Selisih kecil pada baris item vs total order dapat berasal dari order lama yang diedit sebelum perbaikan perhitungan diskon/ukuran."]);
  if (!input.orders) {
    checkRows.push(["Pemeriksaan yang memakai sheet Order dan Item Order dilewati karena data rinci order tidak tersedia."]);
  }
  const checkSheet: SheetSpec = {
    name: SHEET.check,
    rows: checkRows,
    colWidths: [78, 16, 16, 14, 14],
  };

  // =====================================================================
  // Sheet: Info
  // =====================================================================
  const infoRows: Cell[][] = [
    ["PAKET AUDIT KEUANGAN — Kopi Kabel"],
    [],
    ["Periode", `${start} s/d ${end}`],
    ["Diekspor (WIB)", input.exportedAt],
    ["Zona waktu", "WIB (Asia/Jakarta). Hari dihitung menurut WIB."],
    ["Basis", "Kas. Penjualan = order berstatus completed."],
    [],
  ];

  if (input.orders) {
    const statusCount = new Map<string, number>();
    const seen = new Set<number>();
    input.orders.forEach((r) => {
      if (seen.has(r.order_id)) return;
      seen.add(r.order_id);
      statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1);
    });
    infoRows.push(["Jumlah order pada periode (semua status)", seen.size]);
    ["completed", "cancelled", "spam", "pending"].forEach((s) =>
      infoRows.push([`   status ${s}`, statusCount.get(s) ?? 0]),
    );
    infoRows.push([]);
  }

  infoRows.push(["Kategori HPP", hppCats.join(", ") || "(tidak ada)"]);
  infoRows.push(["Kategori Biaya Operasional", opexCats.join(", ") || "(tidak ada)"]);
  infoRows.push([]);
  infoRows.push(["ISI FILE (sheet)"]);
  const sheetGuide: [string, string][] = [
    [SHEET.check, "Perbandingan angka dari sumber berbeda. Semua baris harus OK."],
    [SHEET.pl, "Laporan laba/rugi; semua angka memakai rumus yang merujuk sheet rinci."],
    [SHEET.cat, "HPP dan biaya operasional per kategori (jumlah transaksi, total, persentase)."],
    [SHEET.exp, "Setiap transaksi pengeluaran, dengan kelompok HPP/Operasional."],
    [SHEET.inc, "Setiap pemasukan di luar penjualan (pendapatan lain dan setoran modal)."],
    [SHEET.menu, "HPP, laba kotor, dan margin per menu berdasarkan biaya per porsi."],
    [SHEET.cash, "Kas masuk dan keluar per hari, tunai dan non-tunai, saldo kumulatif."],
    [SHEET.sales, "Penjualan order completed per hari, lantai, dan metode bayar."],
    [SHEET.floor, "Ringkasan penjualan per lantai."],
    [SHEET.orders, "Setiap order (semua status) dengan lantai, sumber, pembuat, dan pemroses."],
    [SHEET.items, "Setiap item pada setiap order, untuk menelusuri total order."],
    [SHEET.del, "Order yang pernah dihapus dari database beserta waktunya."],
  ];
  sheetGuide.forEach(([n, d]) => infoRows.push([n, d]));

  if (input.warnings.length > 0) {
    infoRows.push([]);
    infoRows.push(["PERINGATAN SAAT EKSPOR"]);
    input.warnings.forEach((w) => infoRows.push([`- ${w}`]));
  }
  const infoSheet: SheetSpec = { name: SHEET.info, rows: infoRows, colWidths: [42, 90] };

  // ===== Urutan akhir =====
  const out: SheetSpec[] = [infoSheet, checkSheet, plSheet, catSheet, expSheet, incSheet];
  if (menuSheet) out.push(menuSheet);
  out.push(cashSheet, salesSheet, floorSheet);
  if (orderSheet) out.push(orderSheet);
  if (itemSheet) out.push(itemSheet);
  if (delSheet) out.push(delSheet);
  return out;
}