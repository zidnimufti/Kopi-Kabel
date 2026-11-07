// src/components/OutletGate.tsx
// Letakkan di header BaristaPage:  <OutletGate />
//
// - Menampilkan lantai tempat barista bertugas + tombol "Pindah lantai".
// - Bila absen terbaru belum punya lantai, muncul dialog yang WAJIB diisi.
// - Saat pindah lantai dan MASIH ADA pesanan menunggu di lantai yang ditinggalkan,
//   muncul peringatan dengan pilihan "Kembali" atau "Tetap pindah".
// - Bila shift pada absen terbaru sudah berakhir (dan barista belum absen pulang),
//   muncul pengingat "Absen shift baru". Tidak ada pindah halaman otomatis,
//   supaya keranjang yang sedang dibuat tidak hilang.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from "@heroui/react";
import { supabase } from "../api/supabaseClient";
import { useAuth } from "../auth/hooks/useAuth";
import {
  getTodayAttendance,
  isShiftValidNow,
  setMyOutlet,
} from "../api/attandance";
import { OUTLETS } from "../config/outlets";

// Info peringatan: jumlah pesanan yang masih menunggu di lantai yang akan ditinggalkan
interface LeaveWarning {
  total: number;
  web: number;
}

export default function OutletGate() {
  const auth = useAuth() as any;
  const navigate = useNavigate();
  const userId: string | undefined = auth?.user?.id;

  const [outletId, setOutletId] = useState<number | null>(null);
  const [shift, setShift] = useState<string | null>(null);
  const [clockedOut, setClockedOut] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expired, setExpired] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [warning, setWarning] = useState<LeaveWarning | null>(null);
  const [error, setError] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const row = await getTodayAttendance(userId);
      const id = (row?.outlet_id as number | null | undefined) ?? null;
      setOutletId(id);
      setPicked(id);
      setShift(row?.shift ?? null);
      setClockedOut(!!row?.clock_out);
      setLoaded(true);
      if (id === null) onOpen(); // wajib memilih lantai
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat data absen.");
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cek tiap menit apakah shift pada absen terbaru sudah berakhir
  useEffect(() => {
    const check = () => setExpired(!!shift && !clockedOut && !isShiftValidNow(shift));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [shift, clockedOut]);

  const openModal = () => {
    setPicked(outletId);
    setWarning(null);
    setError("");
    onOpen();
  };

  const closeModal = () => {
    setWarning(null);
    setError("");
    onClose();
  };

  // Benar-benar memindahkan lantai
  const doSwitch = async () => {
    if (!picked) return;
    setSaving(true);
    setError("");
    try {
      await setMyOutlet(picked);
      setOutletId(picked);
      setWarning(null);
      onClose();
      window.location.reload(); // muat ulang antrean sesuai lantai baru
    } catch (e: any) {
      setError(e?.message ?? "Gagal menyimpan lantai.");
    } finally {
      setSaving(false);
    }
  };

  // Tombol "Simpan lantai": bila pindah dari lantai yang sudah dipilih dan masih ada
  // pesanan menunggu di sana, tampilkan peringatan dulu.
  const save = async () => {
    if (!picked) return;

    if (outletId !== null && picked !== outletId) {
      setChecking(true);
      setError("");
      try {
        const { data, error: qErr } = await supabase
          .from("orders")
          .select("id, source")
          .eq("status", "pending")
          .eq("outlet_id", outletId);

        if (!qErr && data && data.length > 0) {
          setWarning({
            total: data.length,
            web: data.filter((o: any) => o.source === "web").length,
          });
          return; // tunggu keputusan barista
        }
        // Tidak ada pesanan menunggu (atau pengecekan gagal): lanjut pindah.
      } catch {
        /* pengecekan gagal: jangan menghalangi pindah lantai */
      } finally {
        setChecking(false);
      }
    }

    await doSwitch();
  };

  const current = OUTLETS.find((o) => o.id === outletId);
  const fromName = current?.name ?? "lantai ini";
  const toName = OUTLETS.find((o) => o.id === picked)?.name ?? "";
  const mustChoose = loaded && outletId === null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={current ? "primary" : "warning"} size="sm" variant="flat">
          {current ? current.name : "Lantai belum dipilih"}
        </Chip>
        <Button size="sm" variant="light" onPress={openModal}>
          Pindah lantai
        </Button>

        {expired && (
          <>
            <Chip color="warning" size="sm" variant="flat">
              {shift} sudah berakhir
            </Chip>
            <Button
              size="sm"
              color="warning"
              variant="flat"
              onPress={() => navigate("/app/verify-attendance")}
            >
              Absen shift baru
            </Button>
          </>
        )}
      </div>

      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        isDismissable={!mustChoose}
        hideCloseButton={mustChoose}
        isKeyboardDismissDisabled={mustChoose}
        placement="center"
        scrollBehavior="inside"
      >
        <ModalContent>
          {warning ? (
            <>
              <ModalHeader>Masih ada pesanan menunggu</ModalHeader>
              <ModalBody className="gap-3">
                <div className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm">
                  <p className="font-semibold">
                    {warning.total} pesanan belum selesai di {fromName}
                    {warning.web > 0 ? ` (${warning.web} dari web)` : ""}.
                  </p>
                  <p className="mt-2 text-default-700">
                    Jika Anda pindah ke {toName}, pesanan itu hanya terlihat oleh barista
                    yang bertugas di {fromName}. Bila belum ada barista lain di sana,
                    pelanggan akan menunggu tanpa ada yang tahu.
                  </p>
                </div>
                <p className="text-xs text-default-500">
                  Sebaiknya selesaikan, batalkan, atau serahkan dulu pesanan tersebut ke
                  barista yang bertugas di {fromName}. Pesanan yang Anda buat sendiri tetap
                  terlihat di antrean Anda.
                </p>
                {error && <p className="text-danger text-sm">{error}</p>}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" isDisabled={saving} onPress={() => setWarning(null)}>
                  Kembali
                </Button>
                <Button color="warning" isLoading={saving} onPress={doSwitch}>
                  Tetap pindah
                </Button>
              </ModalFooter>
            </>
          ) : (
            <>
              <ModalHeader>
                {mustChoose ? "Pilih lantai bertugas" : "Pindah lantai"}
              </ModalHeader>
              <ModalBody className="gap-3">
                <p className="text-sm text-default-500">
                  Order dan antrean yang Anda lihat mengikuti lantai yang dipilih.
                </p>
                <div className="flex gap-2">
                  {OUTLETS.map((o) => (
                    <Button
                      key={o.id}
                      className="flex-1"
                      color={picked === o.id ? "primary" : "default"}
                      variant={picked === o.id ? "solid" : "flat"}
                      onPress={() => setPicked(o.id)}
                    >
                      {o.name}
                    </Button>
                  ))}
                </div>
                {error && <p className="text-danger text-sm">{error}</p>}
              </ModalBody>
              <ModalFooter>
                {!mustChoose && (
                  <Button variant="light" onPress={closeModal}>
                    Batal
                  </Button>
                )}
                <Button
                  color="primary"
                  isDisabled={!picked || picked === outletId}
                  isLoading={saving || checking}
                  onPress={save}
                >
                  Simpan lantai
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}