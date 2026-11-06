// src/components/OutletGate.tsx
// Letakkan di header/atas BaristaPage:  <OutletGate />
//
// - Menampilkan lantai tempat barista bertugas hari ini + tombol "Pindah lantai".
// - Bila absen hari ini belum punya lantai (mis. barista yang sudah absen sebelum
//   fitur ini ada), muncul dialog yang WAJIB diisi sebelum bekerja.
// - Setelah lantai berubah, halaman dimuat ulang supaya antrean order mengikuti
//   lantai yang baru.

import { useCallback, useEffect, useState } from "react";
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
import { getTodayOutletId, setMyOutlet } from "../api/attandance";
import { OUTLETS } from "../config/outlets";

export default function OutletGate() {
  const auth = useAuth() as any;
  const userId: string | undefined = auth?.user?.id;

  const [outletId, setOutletId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const id = await getTodayOutletId(userId);
      setOutletId(id);
      setPicked(id);
      setLoaded(true);
      if (id === null) onOpen(); // wajib memilih
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat lantai bertugas.");
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="flex items-center gap-2">
        <Chip color={current ? "primary" : "warning"} size="sm" variant="flat">
          {current ? current.name : "Lantai belum dipilih"}
        </Chip>
        <Button size="sm" variant="light" onPress={onOpen}>
          Pindah lantai
        </Button>
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