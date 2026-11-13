// src/pages/admin/RecipesPage.tsx
// Resep per menu + harga bahan => biaya per porsi dan margin otomatis.
// Hanya untuk admin (route dibungkus RoleGuard; data dilindungi RLS).

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
  addItem,
  getRecipeData,
  saveItemCost,
  saveRecipe,
  type MenuRow,
  type RecipeData,
  type RecipeSize,
} from "@/api/RecipeApi";
import {
  costPerUnitFromPack,
  effectivePrice,
  marginPct,
  recipeCost,
  scaleRecipe,
  type ItemInfo,
  type RecipeLine,
} from "./finance/calcRecipe";

// ===== Konstanta & util =====
const UNITS = ["Gram", "Ml", "Pcs"];
const MARGIN_GOOD = 60; // >= ini: hijau
const MARGIN_LOW = 40; // < ini: merah; di antaranya kuning

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

// Terima koma sebagai pemisah desimal ("1,5")
const toNum = (s: string): number => Number(s.trim().replace(",", "."));

let uid = 0;
const nextKey = () => `l${++uid}`;

interface DraftLine {
  key: string;
  itemId: string;
  qty: string;
}

type DraftBySize = Record<RecipeSize, DraftLine[]>;

const hasLarge = (m: MenuRow) => m.price_large !== null && m.price_large > 0;

// ===== Halaman =====
export default function RecipesPage() {
  const [data, setData] = useState<RecipeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"menu" | "bahan">("menu");

  // Tab menu
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  // Editor resep
  const [editMenu, setEditMenu] = useState<MenuRow | null>(null);
  const [editSize, setEditSize] = useState<RecipeSize>("regular");
  const [draft, setDraft] = useState<DraftBySize>({ regular: [], large: [] });
  const [factor, setFactor] = useState("1,3");
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // Tab bahan
  const [costDraft, setCostDraft] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", unit: "Gram", cost: "" });
  const [adding, setAdding] = useState(false);
  const [pack, setPack] = useState<{ itemId: string; price: string; qty: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getRecipeData();
      setData(d);
      setCostDraft(
        Object.fromEntries(
          d.items.map((i) => [i.id, i.cost_per_unit === null ? "" : String(i.cost_per_unit)]),
        ),
      );
      setError(null);
    } catch (e: any) {
      setError(
        (e?.message ?? "Gagal memuat data resep.") +
          " Pastikan sql/09_resep_bahan.sql sudah dijalankan.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ----- Turunan data -----
  const itemMap = useMemo(() => {
    const m = new Map<string, ItemInfo>();
    (data?.items ?? []).forEach((i) =>
      m.set(i.id, { id: i.id, name: i.name, unit: i.unit, cost: i.cost_per_unit }),
    );
    return m;
  }, [data]);

  const recipesBy = useMemo(() => {
    const m = new Map<string, RecipeLine[]>();
    (data?.recipes ?? []).forEach((r) => {
      const k = `${r.product_id}|${r.size}`;
      const list = m.get(k) ?? [];
      list.push({ itemId: r.item_id, qty: r.qty });
      m.set(k, list);
    });
    return m;
  }, [data]);

  const usedIn = useMemo(() => {
    const m = new Map<string, Set<number>>();
    (data?.recipes ?? []).forEach((r) => {
      const s = m.get(r.item_id) ?? new Set<number>();
      s.add(r.product_id);
      m.set(r.item_id, s);
    });
    return m;
  }, [data]);

  type SizeInfo = {
    price: number;
    lines: number;
    cost: number;
    missing: number;
    complete: boolean;
    margin: number | null;
  };

  const sizeInfo = useCallback(
    (menu: MenuRow, size: RecipeSize): SizeInfo | null => {
      if (size === "large" && !hasLarge(menu)) return null;
      const base = size === "large" ? (menu.price_large as number) : menu.price;
      const price = effectivePrice(base, menu.discount);
      const rc = recipeCost(recipesBy.get(`${menu.id}|${size}`) ?? [], itemMap);
      return {
        price,
        lines: rc.lines,
        cost: rc.cost,
        missing: rc.missing,
        complete: rc.complete,
        margin: rc.complete ? marginPct(price, rc.cost) : null,
      };
    },
    [recipesBy, itemMap],
  );

  type MenuStatus = "lengkap" | "sebagian" | "kosong";

  const menuStatus = useCallback(
    (menu: MenuRow): MenuStatus => {
      const infos = [sizeInfo(menu, "regular"), sizeInfo(menu, "large")].filter(
        (x): x is SizeInfo => x !== null,
      );
      if (infos.every((i) => i.complete)) return "lengkap";
      if (infos.some((i) => i.lines > 0)) return "sebagian";
      return "kosong";
    },
    [sizeInfo],
  );

  const menus = data?.menus ?? [];
  const completeCount = menus.filter((m) => menuStatus(m) === "lengkap").length;

  const visibleMenus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menus.filter(
      (m) =>
        (!q || m.name.toLowerCase().includes(q)) &&
        (!onlyIncomplete || menuStatus(m) !== "lengkap"),
    );
  }, [menus, search, onlyIncomplete, menuStatus]);

  // ----- Editor resep -----
  const openEditor = (menu: MenuRow) => {
    const toDraft = (size: RecipeSize): DraftLine[] =>
      (recipesBy.get(`${menu.id}|${size}`) ?? []).map((l) => ({
        key: nextKey(),
        itemId: l.itemId,
        qty: String(l.qty),
      }));
    setDraft({ regular: toDraft("regular"), large: toDraft("large") });
    setEditSize("regular");
    setEditorError(null);
    setEditMenu(menu);
  };

  const updateLine = (size: RecipeSize, key: string, patch: Partial<DraftLine>) =>
    setDraft((d) => ({
      ...d,
      [size]: d[size].map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }));

  const addLine = (size: RecipeSize) =>
    setDraft((d) => ({ ...d, [size]: [...d[size], { key: nextKey(), itemId: "", qty: "" }] }));

  const removeLine = (size: RecipeSize, key: string) =>
    setDraft((d) => ({ ...d, [size]: d[size].filter((l) => l.key !== key) }));

  /** Ubah draft menjadi baris resep. Baris yang sama sekali kosong diabaikan. */
  const parseDraft = (lines: DraftLine[]): { lines: RecipeLine[]; error: string | null } => {
    const out: RecipeLine[] = [];
    for (const l of lines) {
      const empty = !l.itemId && l.qty.trim() === "";
      if (empty) continue;
      const qty = toNum(l.qty);
      if (!l.itemId) return { lines: [], error: "Ada baris yang bahannya belum dipilih." };
      if (!(qty > 0)) return { lines: [], error: "Jumlah bahan harus lebih dari 0." };
      out.push({ itemId: l.itemId, qty });
    }
    return { lines: out, error: null };
  };

  const copyRegularToLarge = () => {
    const f = toNum(factor);
    if (!(f > 0)) {
      setEditorError("Faktor harus lebih dari 0.");
      return;
    }
    const parsed = parseDraft(draft.regular);
    if (parsed.error) {
      setEditorError(parsed.error);
      return;
    }
    setEditorError(null);
    setDraft((d) => ({
      ...d,
      large: scaleRecipe(parsed.lines, f, itemMap).map((l) => ({
        key: nextKey(),
        itemId: l.itemId,
        qty: String(l.qty),
      })),
    }));
  };

  const saveEditor = async () => {
    if (!editMenu) return;
    const sizes: RecipeSize[] = hasLarge(editMenu) ? ["regular", "large"] : ["regular"];

    const toSave: { size: RecipeSize; lines: RecipeLine[] }[] = [];
    for (const size of sizes) {
      const parsed = parseDraft(draft[size]);
      if (parsed.error) {
        setEditorError(`${size === "large" ? "Large" : "Regular"}: ${parsed.error}`);
        return;
      }
      const stored = recipesBy.get(`${editMenu.id}|${size}`) ?? [];
      // lewati bila kosong dan memang belum pernah ada resepnya
      if (parsed.lines.length === 0 && stored.length === 0) continue;
      toSave.push({ size, lines: parsed.lines });
    }

    setSaving(true);
    setEditorError(null);
    try {
      for (const t of toSave) {
        await saveRecipe(
          editMenu.id,
          t.size,
          t.lines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
        );
      }
      setEditMenu(null);
      await load();
    } catch (e: any) {
      setEditorError(e?.message ?? "Gagal menyimpan resep.");
    } finally {
      setSaving(false);
    }
  };

  // Ringkasan biaya untuk draft yang sedang diedit
  const draftSummary = (size: RecipeSize) => {
    if (!editMenu) return null;
    if (size === "large" && !hasLarge(editMenu)) return null;
    const parsed = parseDraft(draft[size]);
    const lines = parsed.error ? [] : parsed.lines;
    const rc = recipeCost(lines, itemMap);
    const base = size === "large" ? (editMenu.price_large as number) : editMenu.price;
    const price = effectivePrice(base, editMenu.discount);
    const noCost = lines
      .map((l) => itemMap.get(l.itemId))
      .filter((it): it is ItemInfo => !!it && it.cost === null)
      .map((it) => it.name);
    return { rc, price, margin: rc.lines > 0 ? marginPct(price, rc.cost) : null, noCost };
  };

  // ----- Bahan -----
  const saveCost = async (itemId: string) => {
    const raw = (costDraft[itemId] ?? "").trim();
    let value: number | null = null;
    if (raw !== "") {
      value = toNum(raw);
      if (Number.isNaN(value) || value < 0) {
        setError("Harga per satuan harus berupa angka 0 atau lebih.");
        return;
      }
    }
    setSavingItem(itemId);
    try {
      await saveItemCost(itemId, value);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Gagal menyimpan harga bahan.");
    } finally {
      setSavingItem(null);
    }
  };

  const submitNewItem = async () => {
    if (!newItem.name.trim()) {
      setError("Nama bahan wajib diisi.");
      return;
    }
    let cost: number | null = null;
    if (newItem.cost.trim() !== "") {
      cost = toNum(newItem.cost);
      if (Number.isNaN(cost) || cost < 0) {
        setError("Harga per satuan harus berupa angka 0 atau lebih.");
        return;
      }
    }
    setAdding(true);
    try {
      await addItem(newItem.name, newItem.unit, cost);
      setNewItem({ name: "", unit: newItem.unit, cost: "" });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Gagal menambah bahan.");
    } finally {
      setAdding(false);
    }
  };

  const packResult = pack ? costPerUnitFromPack(toNum(pack.price), toNum(pack.qty)) : null;
  const packItem = pack ? itemMap.get(pack.itemId) : undefined;

  const applyPack = async () => {
    if (!pack || packResult === null) return;
    setSavingItem(pack.itemId);
    try {
      await saveItemCost(pack.itemId, Math.round(packResult * 100) / 100);
      setPack(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Gagal menyimpan harga bahan.");
    } finally {
      setSavingItem(null);
    }
  };

  // ===== Tampilan =====
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4 overflow-x-hidden">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          Resep & Bahan {loading && <Spinner size="sm" />}
        </h1>
        <p className="text-default-500">
          Isi harga bahan dan resep tiap menu; biaya per porsi dan margin dihitung otomatis dan
          dipakai di Keuangan, tab HPP per Menu. Stok bahan tetap dikelola di halaman Stok.
        </p>
      </div>

      <Card shadow="none" className="bg-default-50">
        <CardBody className="text-sm space-y-1">
          <p className="font-medium">Urutan pengisian</p>
          <p>
            1. Tab <b>Bahan & Harga</b>: daftarkan bahan (gram, ml, pcs) dan harga per satuannya.
          </p>
          <p>
            2. Tab <b>Resep per Menu</b>: tekan <b>Atur Resep</b> pada tiap menu dan isi jumlah bahan
            untuk satu porsi.
          </p>
          <p>3. Lihat hasilnya di Keuangan, tab HPP per Menu.</p>
        </CardBody>
      </Card>

      {error && (
        <Card shadow="none">
          <CardBody className="text-danger text-sm">{error}</CardBody>
        </Card>
      )}

      <div className="overflow-x-auto w-full">
        <Tabs
          aria-label="Resep dan bahan"
          className="w-max"
          selectedKey={tab}
          onSelectionChange={(k) => setTab(k as "menu" | "bahan")}
        >
          <Tab key="menu" title="Resep per Menu" />
          <Tab key="bahan" title="Bahan & Harga" />
        </Tabs>
      </div>

      {/* ===================== RESEP PER MENU ===================== */}
      {tab === "menu" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              className="sm:max-w-xs"
              label="Cari menu"
              size="sm"
              value={search}
              onValueChange={setSearch}
            />
            <Button
              size="sm"
              variant={onlyIncomplete ? "solid" : "flat"}
              color={onlyIncomplete ? "primary" : "default"}
              onPress={() => setOnlyIncomplete((v) => !v)}
            >
              Hanya yang belum lengkap
            </Button>
            <p className="text-sm text-default-500 sm:ml-auto">
              {completeCount} dari {menus.length} menu sudah punya resep lengkap
            </p>
          </div>

          <Card>
            <CardBody className="overflow-x-auto">
              <Table removeWrapper aria-label="Resep per menu" className="min-w-[860px]">
                <TableHeader>
                  <TableColumn>Menu</TableColumn>
                  <TableColumn>Harga jual</TableColumn>
                  <TableColumn>Biaya / porsi</TableColumn>
                  <TableColumn>Margin</TableColumn>
                  <TableColumn>Status</TableColumn>
                  <TableColumn>Aksi</TableColumn>
                </TableHeader>
                <TableBody
                  emptyContent={loading ? "Memuat…" : "Tidak ada menu."}
                  items={visibleMenus}
                >
                  {(m: MenuRow) => {
                    const reg = sizeInfo(m, "regular");
                    const lrg = sizeInfo(m, "large");
                    const status = menuStatus(m);
                    const show = (i: SizeInfo | null, f: (x: SizeInfo) => string) =>
                      i === null ? "—" : f(i);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            <div>Reg: {show(reg, (i) => fmtIDR(i.price))}</div>
                            {lrg && <div>Lrg: {fmtIDR(lrg.price)}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            <div>
                              Reg: {reg && reg.lines > 0 ? fmtIDR(reg.cost) : "—"}
                              {reg && reg.missing > 0 ? " *" : ""}
                            </div>
                            {lrg && (
                              <div>
                                Lrg: {lrg.lines > 0 ? fmtIDR(lrg.cost) : "—"}
                                {lrg.missing > 0 ? " *" : ""}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Chip size="sm" variant="flat" color={marginColor(reg?.margin ?? null)}>
                              Reg {fmtPct(reg?.margin ?? null)}
                            </Chip>
                            {lrg && (
                              <Chip size="sm" variant="flat" color={marginColor(lrg.margin)}>
                                Lrg {fmtPct(lrg.margin)}
                              </Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {status === "lengkap" && (
                            <Chip size="sm" variant="flat" color="success">
                              Lengkap
                            </Chip>
                          )}
                          {status === "sebagian" && (
                            <Chip size="sm" variant="flat" color="warning">
                              Belum lengkap
                            </Chip>
                          )}
                          {status === "kosong" && (
                            <Chip size="sm" variant="flat">
                              Belum ada resep
                            </Chip>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="flat" onPress={() => openEditor(m)}>
                            Atur Resep
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </TableBody>
              </Table>
            </CardBody>
          </Card>

          <p className="text-xs text-default-400">
            * Ada bahan di resep yang harga per satuannya belum diisi, jadi biaya belum lengkap.
            Warna margin: hijau ≥ {MARGIN_GOOD}%, kuning {MARGIN_LOW}–{MARGIN_GOOD - 1}%, merah di
            bawah {MARGIN_LOW}%.
          </p>
        </div>
      )}

      {/* ===================== BAHAN & HARGA ===================== */}
      {tab === "bahan" && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <p className="font-semibold">Tambah bahan baru</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <Input
                  className="sm:col-span-2"
                  label="Nama bahan"
                  placeholder="mis. Susu cair, Gelas 16oz"
                  size="sm"
                  value={newItem.name}
                  onValueChange={(v) => setNewItem((n) => ({ ...n, name: v }))}
                />
                <Select
                  label="Satuan"
                  selectedKeys={[newItem.unit]}
                  size="sm"
                  onChange={(e) => e.target.value && setNewItem((n) => ({ ...n, unit: e.target.value }))}
                >
                  {UNITS.map((u) => (
                    <SelectItem key={u}>{u}</SelectItem>
                  ))}
                </Select>
                <Input
                  label={`Harga per ${newItem.unit.toLowerCase()} (opsional)`}
                  min="0"
                  size="sm"
                  startContent="Rp"
                  value={newItem.cost}
                  onValueChange={(v) => setNewItem((n) => ({ ...n, cost: v }))}
                />
              </div>
              <div>
                <Button color="primary" isLoading={adding} size="sm" onPress={submitNewItem}>
                  Tambah Bahan
                </Button>
              </div>
              <p className="text-xs text-default-400">
                Simpan dalam satuan terkecil (gram, ml, pcs) supaya resep mudah dihitung. Bahan yang
                ditambah di sini juga muncul di halaman Stok.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="overflow-x-auto">
              <Table removeWrapper aria-label="Bahan dan harga" className="min-w-[760px]">
                <TableHeader>
                  <TableColumn>Bahan</TableColumn>
                  <TableColumn>Satuan</TableColumn>
                  <TableColumn>Harga per satuan (Rp)</TableColumn>
                  <TableColumn>Dipakai di</TableColumn>
                  <TableColumn>Aksi</TableColumn>
                </TableHeader>
                <TableBody
                  emptyContent={loading ? "Memuat…" : "Belum ada bahan. Tambahkan di atas."}
                  items={data?.items ?? []}
                >
                  {(it) => {
                    const draftVal = costDraft[it.id] ?? "";
                    const stored = it.cost_per_unit === null ? "" : String(it.cost_per_unit);
                    const changed = draftVal.trim() !== stored;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell>{it.unit}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              aria-label={`Harga per satuan ${it.name}`}
                              className="w-36"
                              min="0"
                              size="sm"
                              startContent="Rp"
                              value={draftVal}
                              onValueChange={(v) => setCostDraft((d) => ({ ...d, [it.id]: v }))}
                            />
                            {it.cost_per_unit === null && (
                              <Chip size="sm" variant="flat" color="warning">
                                belum diisi
                              </Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{usedIn.get(it.id)?.size ?? 0} menu</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              color="primary"
                              isDisabled={!changed}
                              isLoading={savingItem === it.id}
                              size="sm"
                              onPress={() => saveCost(it.id)}
                            >
                              Simpan
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() => setPack({ itemId: it.id, price: "", qty: "" })}
                            >
                              Hitung dari kemasan
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ===================== EDITOR RESEP ===================== */}
      <Modal
        isOpen={!!editMenu}
        onOpenChange={(o) => !o && setEditMenu(null)}
        placement="center"
        scrollBehavior="inside"
        size="3xl"
      >
        <ModalContent>
          <>
            <ModalHeader className="flex flex-col gap-1">
              Resep: {editMenu?.name}
              <span className="text-sm font-normal text-default-500">
                Isi jumlah bahan untuk SATU porsi (dalam satuan bahan).
              </span>
            </ModalHeader>
            <ModalBody className="gap-3">
              {editMenu && hasLarge(editMenu) && (
                <Tabs
                  aria-label="Ukuran"
                  selectedKey={editSize}
                  onSelectionChange={(k) => setEditSize(k as RecipeSize)}
                >
                  <Tab key="regular" title="Regular" />
                  <Tab key="large" title="Large" />
                </Tabs>
              )}

              {editSize === "large" && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg bg-default-50 p-3">
                  <Input
                    className="w-28"
                    label="Faktor"
                    size="sm"
                    value={factor}
                    onValueChange={setFactor}
                  />
                  <Button size="sm" variant="flat" onPress={copyRegularToLarge}>
                    Salin dari Regular × faktor
                  </Button>
                  <p className="text-xs text-default-400 basis-full">
                    Bahan berhitung (pcs: gelas, tutup, sedotan) tidak dikalikan. Hasil bisa Anda
                    ubah manual.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {draft[editSize].length === 0 && (
                  <p className="text-sm text-default-500">
                    Belum ada bahan. Tekan Tambah Bahan di bawah.
                  </p>
                )}
                {draft[editSize].map((l) => {
                  const it = l.itemId ? itemMap.get(l.itemId) : undefined;
                  const qty = toNum(l.qty);
                  const lineCost =
                    it && it.cost !== null && qty > 0 ? qty * it.cost : null;
                  return (
                    <div
                      key={l.key}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start rounded-lg border border-default-200 p-3"
                    >
                      <div className="sm:col-span-5">
                        <Select
                          aria-label="Bahan"
                          label="Bahan"
                          selectedKeys={l.itemId ? [l.itemId] : []}
                          size="sm"
                          onChange={(e) => updateLine(editSize, l.key, { itemId: e.target.value })}
                        >
                          {(data?.items ?? []).map((i) => (
                            <SelectItem key={i.id}>{`${i.name} (${i.unit})`}</SelectItem>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Input
                          label="Jumlah"
                          size="sm"
                          endContent={<span className="text-xs text-default-400">{it?.unit ?? ""}</span>}
                          value={l.qty}
                          onValueChange={(v) => updateLine(editSize, l.key, { qty: v })}
                        />
                      </div>
                      <div className="sm:col-span-3 text-sm pt-2">
                        {it && it.cost === null ? (
                          <Chip size="sm" variant="flat" color="warning">
                            harga bahan belum diisi
                          </Chip>
                        ) : (
                          <span>{lineCost === null ? "—" : fmtIDR(lineCost)}</span>
                        )}
                      </div>
                      <div className="sm:col-span-1">
                        <Button
                          isIconOnly
                          aria-label="Hapus baris"
                          color="danger"
                          size="sm"
                          variant="light"
                          onPress={() => removeLine(editSize, l.key)}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button size="sm" variant="flat" onPress={() => addLine(editSize)}>
                  + Tambah Bahan
                </Button>
              </div>

              {(() => {
                const s = draftSummary(editSize);
                if (!s) return null;
                return (
                  <div className="rounded-lg bg-default-50 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Biaya per porsi</span>
                      <span className="font-semibold">{fmtIDR(s.rc.cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Harga jual (setelah diskon)</span>
                      <span>{fmtIDR(s.price)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Margin kotor</span>
                      <Chip size="sm" variant="flat" color={marginColor(s.margin)}>
                        {fmtPct(s.margin)}
                      </Chip>
                    </div>
                    {s.noCost.length > 0 && (
                      <p className="text-xs text-warning">
                        Harga belum diisi untuk: {s.noCost.join(", ")}. Biaya di atas belum lengkap.
                      </p>
                    )}
                  </div>
                );
              })()}

              {editorError && <p className="text-danger text-sm">{editorError}</p>}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" isDisabled={saving} onPress={() => setEditMenu(null)}>
                Batal
              </Button>
              <Button color="primary" isLoading={saving} onPress={saveEditor}>
                Simpan Resep
              </Button>
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>

      {/* ===================== HITUNG DARI KEMASAN ===================== */}
      <Modal isOpen={!!pack} onOpenChange={(o) => !o && setPack(null)} placement="center">
        <ModalContent>
          <>
            <ModalHeader className="flex flex-col gap-1">
              Hitung harga per satuan
              <span className="text-sm font-normal text-default-500">{packItem?.name}</span>
            </ModalHeader>
            <ModalBody className="gap-3">
              <Input
                label="Harga beli kemasan"
                min="0"
                startContent="Rp"
                value={pack?.price ?? ""}
                onValueChange={(v) => setPack((p) => (p ? { ...p, price: v } : p))}
              />
              <Input
                label={`Isi kemasan (dalam ${packItem?.unit ?? "satuan"})`}
                placeholder="mis. 1000 untuk 1 kg dalam gram"
                value={pack?.qty ?? ""}
                onValueChange={(v) => setPack((p) => (p ? { ...p, qty: v } : p))}
              />
              <div className="rounded-lg bg-default-50 p-3 text-sm">
                Harga per {packItem?.unit?.toLowerCase() ?? "satuan"}:{" "}
                <b>{packResult === null ? "—" : fmtIDR(Math.round(packResult * 100) / 100)}</b>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => setPack(null)}>
                Batal
              </Button>
              <Button
                color="primary"
                isDisabled={packResult === null}
                isLoading={savingItem === pack?.itemId}
                onPress={applyPack}
              >
                Pakai dan Simpan
              </Button>
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>
    </div>
  );
}