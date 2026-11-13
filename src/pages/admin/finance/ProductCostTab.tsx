// src/pages/admin/finance/ProductCostTab.tsx
// Tab "HPP per Menu": HPP, laba kotor, dan margin per menu, berdasarkan BIAYA PER PORSI
// yang diisi admin (Regular dan Large). Menu yang biayanya belum diisi tidak dihitung
// marginnya (ditandai "belum diisi"), supaya angka tidak menyesatkan.

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import {
  getProductCosts,
  getProductsLite,
  getSalesByProduct,
  saveProductCosts,
  type ProductCost,
  type ProductLite,
  type ProductSalesRow,
} from "@/api/FinanceApi";
import { buildProductReport } from "./calc";

// Batas warna margin kotor (persen). Ubah sesuai target usaha Anda.
const MARGIN_GOOD = 60; // >= ini: hijau
const MARGIN_LOW = 40; // < ini: merah; di antaranya: kuning

const fmtIDR = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtPct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

const marginColor = (m: number | null): "success" | "warning" | "danger" | "default" => {
  if (m === null) return "default";
  if (m >= MARGIN_GOOD) return "success";
  if (m >= MARGIN_LOW) return "warning";
  return "danger";
};

// Harga jual efektif satu porsi (setelah diskon), sama dengan rumus di kasir & keranjang
const effectivePrice = (base: number, discount: number | null) =>
  discount && discount > 0 ? Math.round(base - (base * discount) / 100) : base;

const parseCost = (v: string): number | null | "invalid" => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) || n < 0 ? "invalid" : n;
};

interface Draft {
  reg: string;
  large: string;
}

export default function ProductCostTab({
  start,
  end,
  actualCogs,
}: {
  start: string;
  end: string;
  /** HPP aktual periode ini dari pengeluaran berkategori HPP (untuk perbandingan) */
  actualCogs: number;
}) {
  const [sales, setSales] = useState<ProductSalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor biaya
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [existing, setExisting] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      setSales(await getSalesByProduct(start, end));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat penjualan per menu.");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const report = useMemo(() => buildProductReport(sales), [sales]);

  // ----- Editor -----
  const openEditor = async () => {
    setEditorOpen(true);
    setEditorLoading(true);
    setEditorError(null);
    setSearch("");
    try {
      const [prods, costs] = await Promise.all([getProductsLite(), getProductCosts()]);
      const byId = new Map<number, ProductCost>(costs.map((c) => [c.product_id, c]));
      const d: Record<number, Draft> = {};
      prods.forEach((p) => {
        const c = byId.get(p.id);
        d[p.id] = {
          reg: c?.cogs_regular != null ? String(c.cogs_regular) : "",
          large: c?.cogs_large != null ? String(c.cogs_large) : "",
        };
      });
      setProducts(prods);
      setExisting(new Set(costs.map((c) => c.product_id)));
      setDrafts(d);
    } catch (e: any) {
      setEditorError(e?.message ?? "Gagal memuat daftar menu.");
    } finally {
      setEditorLoading(false);
    }
  };

  const setDraft = (id: number, field: keyof Draft, value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const saveEditor = async () => {
    const rows: ProductCost[] = [];
    for (const p of products) {
      const d = drafts[p.id];
      if (!d) continue;
      const reg = parseCost(d.reg);
      const large = parseCost(d.large);
      if (reg === "invalid" || large === "invalid") {
        setEditorError(`Biaya "${p.name}" harus berupa angka 0 atau lebih.`);
        return;
      }
      // simpan bila ada isi, atau bila sebelumnya sudah ada (agar bisa dikosongkan)
      if (reg !== null || large !== null || existing.has(p.id)) {
        rows.push({ product_id: p.id, cogs_regular: reg, cogs_large: large });
      }
    }

    setSaving(true);
    setEditorError(null);
    try {
      await saveProductCosts(rows);
      setEditorOpen(false);
      await loadSales();
    } catch (e: any) {
      setEditorError(e?.message ?? "Gagal menyimpan biaya.");
    } finally {
      setSaving(false);
    }
  };

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
  }, [products, search]);

  const filledCount = useMemo(
    () => products.filter((p) => drafts[p.id] && (drafts[p.id].reg.trim() || drafts[p.id].large.trim())).length,
    [products, drafts],
  );

  const diff = actualCogs - report.cogsTheoretical;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-default-500">
          HPP per menu = <b>biaya per porsi</b> × jumlah terjual (order Completed), margin setelah
          diskon. Biaya diambil dari <b>resep</b> (jika lengkap), atau dari <b>biaya manual</b>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button as="a" color="primary" href="/app/admin/recipes">
            Atur Resep
          </Button>
          <Button variant="flat" onPress={openEditor}>
            Biaya Manual
          </Button>
        </div>
      </div>

      {error && (
        <Card shadow="none">
          <CardBody className="text-danger text-sm">{error}</CardBody>
        </Card>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
        <Card shadow="sm">
          <CardBody>
            <p className="text-sm text-default-500">HPP Menu (hitungan)</p>
            <p className="text-2xl font-bold truncate text-danger">
              {fmtIDR(report.cogsTheoretical)}
            </p>
            <p className="text-xs text-default-400">
              Dari menu yang biayanya sudah diisi
            </p>
          </CardBody>
        </Card>
        <Card shadow="sm">
          <CardBody>
            <p className="text-sm text-default-500">Laba Kotor Menu</p>
            <p
              className={`text-2xl font-bold truncate ${
                report.grossTheoretical >= 0 ? "text-success" : "text-danger"
              }`}
            >
              {fmtIDR(report.grossTheoretical)}
            </p>
            <p className="text-xs text-default-400">
              Margin {fmtPct(report.marginTheoretical)}
            </p>
          </CardBody>
        </Card>
        <Card shadow="sm">
          <CardBody>
            <p className="text-sm text-default-500">Cakupan Biaya</p>
            <p className="text-2xl font-bold truncate">{Math.round(report.coverage)}%</p>
            <p className="text-xs text-default-400">
              {report.missingCount > 0
                ? `${report.missingCount} menu belum lengkap`
                : "Semua menu terjual sudah punya biaya"}
            </p>
          </CardBody>
        </Card>
        <Card shadow="sm">
          <CardBody>
            <p className="text-sm text-default-500">Pembelian Bahan (aktual)</p>
            <p className="text-2xl font-bold truncate">{fmtIDR(actualCogs)}</p>
            <p className="text-xs text-default-400">
              Pengeluaran kategori HPP periode ini
            </p>
          </CardBody>
        </Card>
      </div>

      {report.rows.length > 0 && report.coverage < 100 && (
        <Card shadow="none" className="bg-warning-50">
          <CardBody className="text-sm">
            Baru {Math.round(report.coverage)}% pendapatan yang biayanya sudah diisi. Margin di
            bawah hanya menghitung menu yang sudah diisi. Lengkapi lewat{" "}
            <b>Atur Biaya per Porsi</b> agar angkanya akurat.
          </CardBody>
        </Card>
      )}

      {/* Tabel per menu */}
      <Card>
        <CardBody className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-default-500">
              <Spinner size="sm" /> Memuat…
            </div>
          ) : (
            <Table removeWrapper aria-label="HPP per menu" className="min-w-[980px]">
              <TableHeader>
                <TableColumn>Menu</TableColumn>
                <TableColumn>Terjual</TableColumn>
                <TableColumn>Pendapatan</TableColumn>
                <TableColumn>Biaya / porsi</TableColumn>
                <TableColumn>HPP Total</TableColumn>
                <TableColumn>Laba Kotor</TableColumn>
                <TableColumn>Margin</TableColumn>
                <TableColumn>Sumber biaya</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent="Belum ada penjualan (order Completed) pada rentang ini."
                items={report.rows}
              >
                {(r) => (
                  <TableRow key={r.productId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      {r.qty}
                      {r.qtyLarge > 0 && (
                        <span className="text-xs text-default-400">
                          {" "}
                          (Reg {r.qtyRegular} · Lrg {r.qtyLarge})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{fmtIDR(r.revenue)}</TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        {r.qtyRegular > 0 && (
                          <div>
                            Reg:{" "}
                            {r.unitRegular === null ? (
                              <span className="text-warning">belum diisi</span>
                            ) : (
                              fmtIDR(r.unitRegular)
                            )}
                          </div>
                        )}
                        {r.qtyLarge > 0 && (
                          <div>
                            Lrg:{" "}
                            {r.unitLarge === null ? (
                              <span className="text-warning">belum diisi</span>
                            ) : (
                              fmtIDR(r.unitLarge)
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{r.missingAll ? "—" : fmtIDR(r.cogsTotal)}</TableCell>
                    <TableCell>{r.missingAll ? "—" : fmtIDR(r.grossProfit)}</TableCell>
                    <TableCell>
                      {r.missingAll ? (
                        <Chip size="sm" variant="flat" color="warning">
                          belum diisi
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="flat" color={marginColor(r.margin)}>
                          {fmtPct(r.margin)}
                          {!r.complete ? " *" : ""}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.source === "resep" && (
                          <Chip size="sm" variant="flat" color="success">
                            Resep
                          </Chip>
                        )}
                        {r.source === "manual" && (
                          <Chip size="sm" variant="flat">
                            Manual
                          </Chip>
                        )}
                        {r.source === "campur" && (
                          <Chip size="sm" variant="flat" color="secondary">
                            Resep + manual
                          </Chip>
                        )}
                        {r.source === null && !r.recipeIncomplete && <span>—</span>}
                        {r.recipeIncomplete && (
                          <Chip size="sm" variant="flat" color="warning">
                            resep belum lengkap
                          </Chip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="space-y-1 text-xs text-default-400">
        <p>
          * Sebagian ukuran menu itu belum diisi biayanya, jadi margin hanya menghitung ukuran
          yang sudah diisi. Warna margin: hijau ≥ {MARGIN_GOOD}%, kuning {MARGIN_LOW}–
          {MARGIN_GOOD - 1}%, merah di bawah {MARGIN_LOW}%.
        </p>
        <p>
          Perbandingan: pembelian bahan aktual {fmtIDR(actualCogs)} vs HPP menu hitungan{" "}
          {fmtIDR(report.cogsTheoretical)} (selisih {fmtIDR(diff)}). Selisih wajar karena
          pembelian bahan tidak sama dengan pemakaian (ada stok awal/akhir, bahan terbuang, dan
          menu yang biayanya belum diisi).
        </p>
      </div>

      {/* ===== Editor biaya per porsi ===== */}
      <Modal
        isOpen={editorOpen}
        onOpenChange={(o) => setEditorOpen(o)}
        placement="center"
        scrollBehavior="inside"
        size="3xl"
      >
        <ModalContent>
          <>
            <ModalHeader className="flex flex-col gap-1">
              Biaya per Porsi (HPP)
              <span className="text-sm font-normal text-default-500">
                Biaya manual hanya dipakai untuk menu yang belum punya resep lengkap. Isi total biaya
                bahan untuk SATU porsi. Kosongkan bila belum tahu. {filledCount}/{products.length} menu terisi.
              </span>
            </ModalHeader>
            <ModalBody className="gap-3">
              <Input
                label="Cari menu"
                size="sm"
                value={search}
                onValueChange={setSearch}
              />

              {editorLoading ? (
                <div className="flex items-center gap-2 text-default-500">
                  <Spinner size="sm" /> Memuat menu…
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleProducts.length === 0 && (
                    <p className="text-sm text-default-500">Menu tidak ditemukan.</p>
                  )}
                  {visibleProducts.map((p) => {
                    const d = drafts[p.id] ?? { reg: "", large: "" };
                    const sellReg = effectivePrice(p.price, p.discount);
                    const sellLarge =
                      p.price_large && p.price_large > 0
                        ? effectivePrice(p.price_large, p.discount)
                        : null;
                    const regCost = parseCost(d.reg);
                    const largeCost = parseCost(d.large);
                    const mReg =
                      typeof regCost === "number" && sellReg > 0
                        ? ((sellReg - regCost) / sellReg) * 100
                        : null;
                    const mLarge =
                      typeof largeCost === "number" && sellLarge
                        ? ((sellLarge - largeCost) / sellLarge) * 100
                        : null;

                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-default-200 p-3 space-y-2"
                      >
                        <p className="font-medium break-words">{p.name}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Input
                              label={`Regular (jual ${fmtIDR(sellReg)})`}
                              min="0"
                              size="sm"
                              startContent="Rp"
                              type="number"
                              value={d.reg}
                              onValueChange={(v) => setDraft(p.id, "reg", v)}
                            />
                            {mReg !== null && (
                              <Chip size="sm" variant="flat" color={marginColor(mReg)}>
                                margin {fmtPct(mReg)}
                              </Chip>
                            )}
                          </div>
                          {sellLarge !== null ? (
                            <div className="space-y-1">
                              <Input
                                label={`Large (jual ${fmtIDR(sellLarge)})`}
                                min="0"
                                size="sm"
                                startContent="Rp"
                                type="number"
                                value={d.large}
                                onValueChange={(v) => setDraft(p.id, "large", v)}
                              />
                              {mLarge !== null && (
                                <Chip size="sm" variant="flat" color={marginColor(mLarge)}>
                                  margin {fmtPct(mLarge)}
                                </Chip>
                              )}
                            </div>
                          ) : (
                            <p className="self-center text-xs text-default-400">
                              Menu ini tidak punya ukuran Large.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {editorError && <p className="text-danger text-sm">{editorError}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" isDisabled={saving} onPress={() => setEditorOpen(false)}>
                Batal
              </Button>
              <Button
                color="primary"
                isDisabled={editorLoading}
                isLoading={saving}
                onPress={saveEditor}
              >
                Simpan
              </Button>
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>
    </div>
  );
}