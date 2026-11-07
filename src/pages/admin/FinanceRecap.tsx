// --- FILE: src/pages/admin/FinanceRecap.tsx (HeroUI, mobile-first) ---
// Rekap Keuangan: Laba/Rugi, Cashflow, Pemasukan, Pengeluaran, Grafik Harian.
// Hanya bisa dibuka admin (route sudah dibungkus RoleGuard; data dilindungi RLS
// dan fungsi finance_sales_daily yang mengecek is_admin()).

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
} from "@heroui/react";
import {
  createExpense,
  createOtherIncome,
  deleteExpense,
  deleteOtherIncome,
  getExpenseCategoryMeta,
  getExpenses,
  getOtherIncomes,
  getSalesDaily,
  updateExpense,
  updateOtherIncome,
  type CategoryMeta,
  type Expense,
  type IncomeKind,
  type OtherIncome,
  type PayMethod,
  type SalesDailyRow,
} from "@/api/FinanceApi";
import { OUTLETS } from "@/config/outlets";
import { buildReport, toInputDate } from "./finance/calc";

// ===== Utils =====
const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDate = (s: string) =>
  new Date(`${s}T00:00:00`).toLocaleDateString("id-ID");

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
};

const FALLBACK_CATEGORIES = [
  "Bahan baku",
  "Gaji & upah",
  "Sewa tempat",
  "Listrik & air",
  "Peralatan",
  "Kemasan",
  "Promosi",
  "Perawatan",
  "Lain-lain",
];

type ViewTab = "labarugi" | "cashflow" | "pemasukan" | "pengeluaran" | "grafik";

const emptyExpenseForm = (category: string) => ({
  occurred_on: toInputDate(new Date()),
  category,
  description: "",
  amount: "",
  payment_method: "cash" as PayMethod,
});

const emptyIncomeForm = () => ({
  occurred_on: toInputDate(new Date()),
  source: "",
  description: "",
  amount: "",
  payment_method: "cash" as PayMethod,
  kind: "pendapatan" as IncomeKind,
});

// ===== Komponen kecil =====
function StatCard({
  title,
  value,
  hint,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";
  return (
    <Card shadow="sm">
      <CardBody className="text-left">
        <p className="text-sm text-default-500">{title}</p>
        <p className={`text-2xl font-bold truncate ${toneClass}`}>{value}</p>
        {hint && <p className="text-xs text-default-400">{hint}</p>}
      </CardBody>
    </Card>
  );
}

function StatementRow({
  label,
  value,
  bold,
  tone,
  indent,
}: {
  label: string;
  value: number;
  bold?: boolean;
  tone?: "success" | "danger";
  indent?: boolean;
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2 border-b border-default-100 last:border-0 ${
        bold ? "font-semibold" : ""
      } ${indent ? "pl-4 text-default-600" : ""}`}
    >
      <span className="min-w-0 break-words">{label}</span>
      <span className={`shrink-0 ${toneClass}`}>{fmtIDR(value)}</span>
    </div>
  );
}

interface ListRow {
  id: number;
  date: string;
  title: string;
  desc: string;
  method: string;
  amount: number;
  badge?: string;
}

function RowList({
  rows,
  tone,
  emptyText,
  deletingId,
  onEdit,
  onDelete,
}: {
  rows: ListRow[];
  tone: "success" | "danger";
  emptyText: string;
  deletingId: number | null;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      {/* MOBILE */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && (
          <Card shadow="sm">
            <CardBody className="text-default-500 text-sm">{emptyText}</CardBody>
          </Card>
        )}
        {rows.map((row) => (
          <Card key={row.id} className="text-left" shadow="sm">
            <CardBody className="space-y-2">
              <div className="text-xs text-default-500">{fmtDate(row.date)}</div>
              <div className="font-semibold break-words">{row.title}</div>
              <div className="text-sm text-default-600 break-words">
                {row.desc || "—"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip color={tone} size="sm" variant="flat">
                  {row.method}
                </Chip>
                {row.badge && (
                  <Chip size="sm" variant="flat">
                    {row.badge}
                  </Chip>
                )}
              </div>
              <div className="font-medium">{fmtIDR(row.amount)}</div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="flat" onPress={() => onEdit(row.id)}>
                  Ubah
                </Button>
                <Button
                  color="danger"
                  isLoading={deletingId === row.id}
                  size="sm"
                  variant="light"
                  onPress={() => onDelete(row.id)}
                >
                  Hapus
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* DESKTOP */}
      <Card className="hidden md:block">
        <CardBody className="overflow-x-auto">
          <Table removeWrapper aria-label="Daftar transaksi">
            <TableHeader>
              <TableColumn>Tanggal</TableColumn>
              <TableColumn>Kategori / Sumber</TableColumn>
              <TableColumn>Keterangan</TableColumn>
              <TableColumn>Metode</TableColumn>
              <TableColumn>Nominal</TableColumn>
              <TableColumn>Aksi</TableColumn>
            </TableHeader>
            <TableBody emptyContent={emptyText} items={rows}>
              {(row: ListRow) => (
                <TableRow key={row.id}>
                  <TableCell>{fmtDate(row.date)}</TableCell>
                  <TableCell>
                    {row.title}{" "}
                    {row.badge && (
                      <Chip size="sm" variant="flat">
                        {row.badge}
                      </Chip>
                    )}
                  </TableCell>
                  <TableCell>{row.desc || "—"}</TableCell>
                  <TableCell>
                    <Chip color={tone} size="sm" variant="flat">
                      {row.method}
                    </Chip>
                  </TableCell>
                  <TableCell>{fmtIDR(row.amount)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="flat" onPress={() => onEdit(row.id)}>
                      Ubah
                    </Button>
                    <Button
                      color="danger"
                      isLoading={deletingId === row.id}
                      size="sm"
                      variant="light"
                      onPress={() => onDelete(row.id)}
                    >
                      Hapus
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>
    </>
  );
}

function CategoryTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { category: string; total: number }[];
  total: number;
}) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <p className="font-semibold">{title}</p>
        {rows.length === 0 && (
          <p className="text-sm text-default-500">Belum ada data.</p>
        )}
        {rows.map((r) => (
          <div
            key={r.category}
            className="flex items-center justify-between gap-3 text-sm py-1 border-b border-default-100 last:border-0"
          >
            <span className="min-w-0 break-words">{r.category}</span>
            <span className="shrink-0">
              {fmtIDR(r.total)}{" "}
              <span className="text-default-400">
                ({total > 0 ? Math.round((r.total / total) * 100) : 0}%)
              </span>
            </span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

// ===== Halaman =====
export default function FinanceRecapPage() {
  const today = new Date();
  const d30 = new Date();
  d30.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(toInputDate(d30));
  const [endDate, setEndDate] = useState(toInputDate(today));

  const [sales, setSales] = useState<SalesDailyRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<OtherIncome[]>([]);
  const [categoryMeta, setCategoryMeta] = useState<CategoryMeta[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("labarugi");

  // Pengeluaran
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [expForm, setExpForm] = useState(() => emptyExpenseForm(FALLBACK_CATEGORIES[0]));
  // Pemasukan lain
  const [incModalOpen, setIncModalOpen] = useState(false);
  const [editingInc, setEditingInc] = useState<OtherIncome | null>(null);
  const [incForm, setIncForm] = useState(emptyIncomeForm);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const categories = useMemo(
    () =>
      categoryMeta.length
        ? categoryMeta.map((c) => c.name)
        : FALLBACK_CATEGORIES,
    [categoryMeta],
  );

  const loadAll = useCallback(async () => {
    const [s, e, i] = await Promise.all([
      getSalesDaily(startDate, endDate),
      getExpenses(startDate, endDate),
      getOtherIncomes(startDate, endDate),
    ]);
    setSales(s);
    setExpenses(e);
    setIncomes(i);
  }, [startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    loadAll()
      .then(() => setError(null))
      .catch((err) => setError(err?.message ?? "Gagal memuat data keuangan."))
      .finally(() => setLoading(false));
  }, [loadAll]);

  useEffect(() => {
    getExpenseCategoryMeta()
      .then(setCategoryMeta)
      .catch(() => setCategoryMeta([]));
  }, []);

  const report = useMemo(
    () =>
      buildReport({
        start: startDate,
        end: endDate,
        sales,
        expenses,
        incomes,
        categories: categoryMeta,
      }),
    [startDate, endDate, sales, expenses, incomes, categoryMeta],
  );

  // ----- Rentang cepat -----
  const quick = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(toInputDate(start));
    setEndDate(toInputDate(end));
  };
  const thisMonth = () => {
    const now = new Date();
    setStartDate(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setEndDate(toInputDate(now));
  };
  const lastMonth = () => {
    const now = new Date();
    setStartDate(toInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    setEndDate(toInputDate(new Date(now.getFullYear(), now.getMonth(), 0)));
  };

  // ----- Pengeluaran: aksi -----
  const openCreateExpense = () => {
    setEditingExp(null);
    setExpForm(emptyExpenseForm(categories[0]));
    setExpModalOpen(true);
  };
  const openEditExpense = (id: number) => {
    const row = expenses.find((e) => e.id === id);
    if (!row) return;
    setEditingExp(row);
    setExpForm({
      occurred_on: row.occurred_on,
      category: row.category,
      description: row.description ?? "",
      amount: String(row.amount),
      payment_method: (row.payment_method ?? "cash") as PayMethod,
    });
    setExpModalOpen(true);
  };
  const saveExpense = async () => {
    const amount = Number(expForm.amount);
    if (!amount || amount <= 0) {
      setError("Nominal pengeluaran harus lebih dari 0.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        occurred_on: expForm.occurred_on,
        category: expForm.category,
        description: expForm.description || null,
        amount,
        payment_method: expForm.payment_method,
      };
      if (editingExp) await updateExpense(editingExp.id, payload);
      else await createExpense(payload);
      await loadAll();
      setError(null);
      setExpModalOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "Gagal menyimpan pengeluaran.");
    } finally {
      setSaving(false);
    }
  };
  const removeExpense = async (id: number) => {
    const row = expenses.find((e) => e.id === id);
    if (!row) return;
    if (!window.confirm(`Hapus pengeluaran ${row.category} ${fmtIDR(row.amount)}?`))
      return;
    setDeletingId(id);
    try {
      await deleteExpense(id);
      await loadAll();
    } catch (err: any) {
      setError(err?.message ?? "Gagal menghapus pengeluaran.");
    } finally {
      setDeletingId(null);
    }
  };

  // ----- Pemasukan lain: aksi -----
  const openCreateIncome = () => {
    setEditingInc(null);
    setIncForm(emptyIncomeForm());
    setIncModalOpen(true);
  };
  const openEditIncome = (id: number) => {
    const row = incomes.find((i) => i.id === id);
    if (!row) return;
    setEditingInc(row);
    setIncForm({
      occurred_on: row.occurred_on,
      source: row.source,
      description: row.description ?? "",
      amount: String(row.amount),
      payment_method: (row.payment_method ?? "cash") as PayMethod,
      kind: row.kind,
    });
    setIncModalOpen(true);
  };
  const saveIncome = async () => {
    const amount = Number(incForm.amount);
    if (!amount || amount <= 0) {
      setError("Nominal pemasukan harus lebih dari 0.");
      return;
    }
    if (!incForm.source.trim()) {
      setError("Sumber pemasukan wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        occurred_on: incForm.occurred_on,
        source: incForm.source.trim(),
        description: incForm.description || null,
        amount,
        payment_method: incForm.payment_method,
        kind: incForm.kind,
      };
      if (editingInc) await updateOtherIncome(editingInc.id, payload);
      else await createOtherIncome(payload);
      await loadAll();
      setError(null);
      setIncModalOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "Gagal menyimpan pemasukan.");
    } finally {
      setSaving(false);
    }
  };
  const removeIncome = async (id: number) => {
    const row = incomes.find((i) => i.id === id);
    if (!row) return;
    if (!window.confirm(`Hapus pemasukan ${row.source} ${fmtIDR(row.amount)}?`))
      return;
    setDeletingId(id);
    try {
      await deleteOtherIncome(id);
      await loadAll();
    } catch (err: any) {
      setError(err?.message ?? "Gagal menghapus pemasukan.");
    } finally {
      setDeletingId(null);
    }
  };

  // ----- Baris untuk daftar -----
  const expenseRows: ListRow[] = useMemo(
    () =>
      expenses.map((e) => ({
        id: e.id,
        date: e.occurred_on,
        title: e.category,
        desc: e.description ?? "",
        method: METHOD_LABEL[e.payment_method ?? "cash"] ?? "—",
        amount: e.amount,
      })),
    [expenses],
  );
  const incomeRows: ListRow[] = useMemo(
    () =>
      incomes.map((i) => ({
        id: i.id,
        date: i.occurred_on,
        title: i.source,
        desc: i.description ?? "",
        method: METHOD_LABEL[i.payment_method ?? "cash"] ?? "—",
        amount: i.amount,
        badge: i.kind === "modal" ? "Modal (bukan laba)" : undefined,
      })),
    [incomes],
  );

  // ----- Ekspor Excel -----
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const r = report;

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["LAPORAN LABA / RUGI"],
        ["Periode", `${startDate} s/d ${endDate}`],
        [],
        ["Penjualan (order completed)", r.salesTotal],
        ["  Tunai", r.salesByMethod.cash],
        ["  QRIS", r.salesByMethod.qris],
        ["Pendapatan lain", r.otherRevenue],
        ["Total Pendapatan", r.revenue],
        ["HPP", -r.cogs],
        ["Laba Kotor", r.grossProfit],
        ["Biaya Operasional", -r.opex],
        ["Laba / Rugi Bersih", r.netProfit],
        [],
        ["Jumlah order completed", r.ordersCount],
      ]),
      "Laba Rugi",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        r.cashDays.map((d) => ({
          Tanggal: d.day,
          "Masuk Tunai": d.inCash,
          "Masuk Non-tunai": d.inNonCash,
          "Keluar Tunai": d.outCash,
          "Keluar Non-tunai": d.outNonCash,
          Netto: d.net,
          "Saldo Kumulatif": d.cumulative,
        })),
      ),
      "Cashflow",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        sales.map((s) => ({
          Tanggal: s.day,
          Lantai: OUTLETS.find((o) => o.id === s.outlet_id)?.name ?? "Tanpa lantai",
          Metode: METHOD_LABEL[s.payment_method ?? ""] ?? "—",
          "Jumlah Order": s.orders_count,
          "Total (Rp)": s.total,
        })),
      ),
      "Penjualan",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        incomes.map((i) => ({
          Tanggal: i.occurred_on,
          Sumber: i.source,
          Jenis: i.kind === "modal" ? "Modal" : "Pendapatan",
          Keterangan: i.description ?? "",
          Metode: METHOD_LABEL[i.payment_method ?? "cash"] ?? "",
          "Nominal (Rp)": i.amount,
        })),
      ),
      "Pemasukan Lain",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        expenses.map((e) => ({
          Tanggal: e.occurred_on,
          Kategori: e.category,
          Keterangan: e.description ?? "",
          Metode: METHOD_LABEL[e.payment_method ?? "cash"] ?? "",
          "Nominal (Rp)": e.amount,
        })),
      ),
      "Pengeluaran",
    );

    XLSX.writeFile(wb, `Rekap_Keuangan_${startDate}_sd_${endDate}.xlsx`);
  };

  const maxDaily = Math.max(1, ...report.daily.map((d) => Math.max(d.income, d.expense)));
  const margin =
    report.revenue > 0 ? Math.round((report.netProfit / report.revenue) * 100) : null;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4 overflow-x-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            Rekap Keuangan {loading && <Spinner size="sm" />}
          </h1>
          <p className="text-default-500">
            Laba/rugi, cashflow, pemasukan, dan pengeluaran. Hanya untuk admin.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Button color="success" onPress={exportExcel}>
            Ekspor Excel
          </Button>
          <Button color="primary" variant="flat" onPress={openCreateIncome}>
            Catat Pemasukan
          </Button>
          <Button className="col-span-2 sm:col-span-1" color="primary" onPress={openCreateExpense}>
            Catat Pengeluaran
          </Button>
        </div>
      </div>

      {/* Filter periode */}
      <Card>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
            <div className="min-w-0">
              <Input
                className="w-full max-w-full"
                label="Tanggal Mulai"
                max={endDate}
                size="sm"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Input
                className="w-full max-w-full"
                label="Tanggal Selesai"
                min={startDate}
                size="sm"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 w-full lg:col-span-2">
              <Button className="w-full" variant="flat" onPress={() => quick(7)}>
                7 hari
              </Button>
              <Button className="w-full" variant="flat" onPress={() => quick(30)}>
                30 hari
              </Button>
              <Button className="w-full" variant="flat" onPress={thisMonth}>
                Bulan ini
              </Button>
              <Button className="w-full" variant="flat" onPress={lastMonth}>
                Bulan lalu
              </Button>
            </div>
          </div>
          <div className="text-sm text-default-700">
            {report.ordersCount} order completed • {incomes.length} pemasukan lain •{" "}
            {expenses.length} pengeluaran
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card shadow="none">
          <CardBody className="text-danger text-sm">{error}</CardBody>
        </Card>
      )}

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
        <StatCard
          hint={`Penjualan ${fmtIDR(report.salesTotal)} • Lain ${fmtIDR(report.otherRevenue)}`}
          title="Pendapatan"
          tone="success"
          value={fmtIDR(report.revenue)}
        />
        <StatCard
          hint={`HPP ${fmtIDR(report.cogs)} • Operasional ${fmtIDR(report.opex)}`}
          title="Pengeluaran"
          tone="danger"
          value={fmtIDR(report.totalExpense)}
        />
        <StatCard
          hint={margin === null ? "Belum ada pendapatan" : `Margin ${margin}%`}
          title="Laba / Rugi Bersih"
          tone={report.netProfit >= 0 ? "success" : "danger"}
          value={fmtIDR(report.netProfit)}
        />
        <StatCard
          hint={`Masuk ${fmtIDR(report.cashIn)} • Keluar ${fmtIDR(report.cashOut)}`}
          title="Arus Kas Bersih"
          tone={report.netCash >= 0 ? "success" : "danger"}
          value={fmtIDR(report.netCash)}
        />
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto w-full">
        <Tabs
          aria-label="Tampilan rekap"
          className="w-max"
          selectedKey={tab}
          onSelectionChange={(k) => setTab(k as ViewTab)}
        >
          <Tab key="labarugi" title="Laba/Rugi" />
          <Tab key="cashflow" title="Cashflow" />
          <Tab key="pemasukan" title="Pemasukan" />
          <Tab key="pengeluaran" title="Pengeluaran" />
          <Tab key="grafik" title="Grafik Harian" />
        </Tabs>
      </div>

      {/* ===== LABA / RUGI ===== */}
      {tab === "labarugi" && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <p className="font-semibold mb-1">Laporan Laba / Rugi</p>
              <StatementRow label="Penjualan (order completed)" value={report.salesTotal} />
              <StatementRow indent label="Tunai" value={report.salesByMethod.cash} />
              <StatementRow indent label="QRIS" value={report.salesByMethod.qris} />
              <StatementRow label="Pendapatan lain" value={report.otherRevenue} />
              <StatementRow bold label="Total Pendapatan" value={report.revenue} />
              <StatementRow label="HPP (harga pokok penjualan)" value={-report.cogs} />
              <StatementRow bold label="Laba Kotor" value={report.grossProfit} />
              <StatementRow label="Biaya Operasional" value={-report.opex} />
              <StatementRow
                bold
                label="Laba / Rugi Bersih"
                tone={report.netProfit >= 0 ? "success" : "danger"}
                value={report.netProfit}
              />
              <p className="text-xs text-default-400 mt-3">
                Basis kas: penjualan dihitung saat order berstatus Completed. Setoran modal
                tidak dihitung sebagai pendapatan. Kategori yang termasuk HPP diatur lewat
                kolom is_cogs pada tabel expense_categories.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="font-semibold">Penjualan per Lantai</p>
              {OUTLETS.map((o) => {
                const v = report.salesByOutlet.get(o.id);
                return (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-3 text-sm py-1 border-b border-default-100 last:border-0"
                  >
                    <span>{o.name}</span>
                    <span>
                      {fmtIDR(v?.total ?? 0)}{" "}
                      <span className="text-default-400">({v?.orders ?? 0} order)</span>
                    </span>
                  </div>
                );
              })}
              {report.salesByOutlet.has(null) && (
                <div className="flex items-center justify-between gap-3 text-sm py-1">
                  <span>Tanpa lantai (data sebelum fitur lantai)</span>
                  <span>
                    {fmtIDR(report.salesByOutlet.get(null)?.total ?? 0)}{" "}
                    <span className="text-default-400">
                      ({report.salesByOutlet.get(null)?.orders ?? 0} order)
                    </span>
                  </span>
                </div>
              )}
              <p className="text-xs text-default-400">
                Pengeluaran belum dipisah per lantai, jadi laba bersih dihitung untuk
                seluruh usaha.
              </p>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CategoryTable
              rows={report.cogsByCategory}
              title="HPP per Kategori"
              total={report.cogs}
            />
            <CategoryTable
              rows={report.opexByCategory}
              title="Biaya Operasional per Kategori"
              total={report.opex}
            />
          </div>
        </div>
      )}

      {/* ===== CASHFLOW ===== */}
      {tab === "cashflow" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
            <StatCard
              hint={`Tunai ${fmtIDR(report.inCash)} • Non-tunai ${fmtIDR(report.inNonCash)}`}
              title="Kas Masuk"
              tone="success"
              value={fmtIDR(report.cashIn)}
            />
            <StatCard
              hint={`Tunai ${fmtIDR(report.outCash)} • Non-tunai ${fmtIDR(report.outNonCash)}`}
              title="Kas Keluar"
              tone="danger"
              value={fmtIDR(report.cashOut)}
            />
            <StatCard
              title="Netto Tunai"
              tone={report.inCash - report.outCash >= 0 ? "success" : "danger"}
              value={fmtIDR(report.inCash - report.outCash)}
            />
            <StatCard
              title="Netto Non-tunai"
              tone={report.inNonCash - report.outNonCash >= 0 ? "success" : "danger"}
              value={fmtIDR(report.inNonCash - report.outNonCash)}
            />
          </div>

          <Card>
            <CardBody className="overflow-x-auto">
              <Table removeWrapper aria-label="Cashflow harian" className="min-w-[760px]">
                <TableHeader>
                  <TableColumn>Tanggal</TableColumn>
                  <TableColumn>Masuk Tunai</TableColumn>
                  <TableColumn>Masuk Non-tunai</TableColumn>
                  <TableColumn>Keluar Tunai</TableColumn>
                  <TableColumn>Keluar Non-tunai</TableColumn>
                  <TableColumn>Netto</TableColumn>
                  <TableColumn>Saldo Kumulatif</TableColumn>
                </TableHeader>
                <TableBody
                  emptyContent="Belum ada transaksi pada rentang ini."
                  items={report.cashDays.filter(
                    (d) => d.inCash + d.inNonCash + d.outCash + d.outNonCash > 0,
                  )}
                >
                  {(d) => (
                    <TableRow key={d.day}>
                      <TableCell>{fmtDate(d.day)}</TableCell>
                      <TableCell>{fmtIDR(d.inCash)}</TableCell>
                      <TableCell>{fmtIDR(d.inNonCash)}</TableCell>
                      <TableCell>{fmtIDR(d.outCash)}</TableCell>
                      <TableCell>{fmtIDR(d.outNonCash)}</TableCell>
                      <TableCell className={d.net >= 0 ? "text-success" : "text-danger"}>
                        {fmtIDR(d.net)}
                      </TableCell>
                      <TableCell>{fmtIDR(d.cumulative)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardBody>
          </Card>

          <p className="text-xs text-default-400">
            Non-tunai = QRIS dan transfer. Penjualan dihitung saat order Completed
            {report.capital > 0 ? `; termasuk setoran modal ${fmtIDR(report.capital)}` : ""}.
            Saldo kumulatif dimulai dari 0 pada tanggal mulai (saldo awal kas belum
            dimasukkan).
          </p>
        </div>
      )}

      {/* ===== PEMASUKAN ===== */}
      {tab === "pemasukan" && (
        <div className="space-y-4">
          <Card shadow="sm">
            <CardBody className="text-sm space-y-1">
              <p>
                <span className="font-semibold">Penjualan otomatis:</span>{" "}
                {fmtIDR(report.salesTotal)} dari {report.ordersCount} order Completed (tidak
                perlu dicatat manual).
              </p>
              <p className="text-default-500">
                Daftar di bawah hanya untuk pemasukan di luar penjualan, misalnya setoran
                modal atau pendapatan lain.
              </p>
            </CardBody>
          </Card>
          <RowList
            deletingId={deletingId}
            emptyText="Belum ada pemasukan lain pada rentang ini."
            rows={incomeRows}
            tone="success"
            onDelete={removeIncome}
            onEdit={openEditIncome}
          />
        </div>
      )}

      {/* ===== PENGELUARAN ===== */}
      {tab === "pengeluaran" && (
        <RowList
          deletingId={deletingId}
          emptyText="Belum ada pengeluaran pada rentang ini. Mulai dengan tombol Catat Pengeluaran."
          rows={expenseRows}
          tone="danger"
          onDelete={removeExpense}
          onEdit={openEditExpense}
        />
      )}

      {/* ===== GRAFIK ===== */}
      {tab === "grafik" && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex gap-4 text-xs text-default-600">
              <span className="flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-success" />
                Pemasukan
              </span>
              <span className="flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-danger" />
                Pengeluaran
              </span>
            </div>
            <div className="flex h-48 items-end gap-1 overflow-x-auto">
              {report.daily.map((d) => (
                <div
                  key={d.day}
                  className="flex min-w-[20px] flex-1 flex-col items-center gap-1"
                  title={`${d.day}\nMasuk ${fmtIDR(d.income)}\nKeluar ${fmtIDR(d.expense)}`}
                >
                  <div className="flex h-36 w-full items-end justify-center gap-[2px]">
                    <div
                      className="w-1/2 rounded-t bg-success"
                      style={{ height: `${(d.income / maxDaily) * 100}%` }}
                    />
                    <div
                      className="w-1/2 rounded-t bg-danger"
                      style={{ height: `${(d.expense / maxDaily) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-default-400">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ===== Modal Pengeluaran ===== */}
      <Modal
        isOpen={expModalOpen}
        placement="center"
        scrollBehavior="inside"
        onOpenChange={(open) => setExpModalOpen(open)}
      >
        <ModalContent>
          <>
            <ModalHeader>
              {editingExp ? "Ubah Pengeluaran" : "Catat Pengeluaran"}
            </ModalHeader>
            <ModalBody className="gap-3">
              <Input
                label="Tanggal"
                type="date"
                value={expForm.occurred_on}
                onChange={(e) => setExpForm((f) => ({ ...f, occurred_on: e.target.value }))}
              />
              <Select
                label="Kategori"
                selectedKeys={[expForm.category]}
                onChange={(e) => setExpForm((f) => ({ ...f, category: e.target.value }))}
              >
                {categories.map((c) => (
                  <SelectItem key={c}>{c}</SelectItem>
                ))}
              </Select>
              <Input
                label="Nominal"
                min="0"
                startContent="Rp"
                type="number"
                value={expForm.amount}
                onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <Input
                label="Keterangan"
                placeholder="mis. beli 5 kg biji arabika"
                value={expForm.description}
                onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))}
              />
              <Select
                label="Metode Pembayaran"
                selectedKeys={[expForm.payment_method]}
                onChange={(e) =>
                  setExpForm((f) => ({ ...f, payment_method: e.target.value as PayMethod }))
                }
              >
                <SelectItem key="cash">Tunai</SelectItem>
                <SelectItem key="qris">QRIS</SelectItem>
                <SelectItem key="transfer">Transfer</SelectItem>
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => setExpModalOpen(false)}>
                Batal
              </Button>
              <Button color="primary" isLoading={saving} onPress={saveExpense}>
                Simpan
              </Button>
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>

      {/* ===== Modal Pemasukan Lain ===== */}
      <Modal
        isOpen={incModalOpen}
        placement="center"
        scrollBehavior="inside"
        onOpenChange={(open) => setIncModalOpen(open)}
      >
        <ModalContent>
          <>
            <ModalHeader>
              {editingInc ? "Ubah Pemasukan" : "Catat Pemasukan Lain"}
            </ModalHeader>
            <ModalBody className="gap-3">
              <Input
                label="Tanggal"
                type="date"
                value={incForm.occurred_on}
                onChange={(e) => setIncForm((f) => ({ ...f, occurred_on: e.target.value }))}
              />
              <Input
                label="Sumber"
                placeholder="mis. Setoran modal pemilik"
                value={incForm.source}
                onChange={(e) => setIncForm((f) => ({ ...f, source: e.target.value }))}
              />
              <Select
                label="Jenis"
                selectedKeys={[incForm.kind]}
                onChange={(e) =>
                  setIncForm((f) => ({ ...f, kind: e.target.value as IncomeKind }))
                }
              >
                <SelectItem key="pendapatan">Pendapatan lain (masuk laba)</SelectItem>
                <SelectItem key="modal">Modal / titipan (bukan laba)</SelectItem>
              </Select>
              <Input
                label="Nominal"
                min="0"
                startContent="Rp"
                type="number"
                value={incForm.amount}
                onChange={(e) => setIncForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <Select
                label="Diterima lewat"
                selectedKeys={[incForm.payment_method]}
                onChange={(e) =>
                  setIncForm((f) => ({ ...f, payment_method: e.target.value as PayMethod }))
                }
              >
                <SelectItem key="cash">Tunai</SelectItem>
                <SelectItem key="qris">QRIS</SelectItem>
                <SelectItem key="transfer">Transfer</SelectItem>
              </Select>
              <Input
                label="Keterangan"
                value={incForm.description}
                onChange={(e) => setIncForm((f) => ({ ...f, description: e.target.value }))}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => setIncModalOpen(false)}>
                Batal
              </Button>
              <Button color="primary" isLoading={saving} onPress={saveIncome}>
                Simpan
              </Button>
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>
    </div>
  );
}