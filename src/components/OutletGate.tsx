// src/components/OutletGate.tsx
// Letakkan di header BaristaPage:  <OutletGate />
//
// - Menampilkan lantai tempat barista bertugas + tombol "Pindah lantai".
// - Bila absen terbaru belum punya lantai, muncul dialog yang WAJIB diisi.
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
import { useAuth } from "../auth/hooks/useAuth";
import {
  getTodayAttendance,
  isShiftValidNow,
  setMyOutlet,
} from "../api/attandance";
import { OUTLETS } from "../config/outlets";

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

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    setError("");
    try {
      await setMyOutlet(picked);
      setOutletId(picked);
      onClose();
      window.location.reload(); // muat ulang antrean sesuai lantai baru
    } catch (e: any) {
      setError(e?.message ?? "Gagal menyimpan lantai.");
    } finally {
      setSaving(false);
    }
  };

  const current = OUTLETS.find((o) => o.id === outletId);
  const mustChoose = loaded && outletId === null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={current ? "primary" : "warning"} size="sm" variant="flat">
          {current ? current.name : "Lantai belum dipilih"}
        </Chip>
        <Button size="sm" variant="light" onPress={onOpen}>
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
        onClose={onClose}
        isDismissable={!mustChoose}
        hideCloseButton={mustChoose}
        isKeyboardDismissDisabled={mustChoose}
        placement="center"
      >
        <ModalContent>
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
              <Button variant="light" onPress={onClose}>
                Batal
              </Button>
            )}
            <Button
              color="primary"
              isDisabled={!picked || picked === outletId}
              isLoading={saving}
              onPress={save}
            >
              Simpan lantai
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}