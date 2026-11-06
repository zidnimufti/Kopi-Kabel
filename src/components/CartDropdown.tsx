// --- FILE: src/components/CartDropdown.tsx ---
// Deskripsi: Dropdown keranjang dengan pembayaran Cash / QRIS
// - Menampilkan size (regular/large) dan menggunakan harga langsung dari DB
import React, { useState, useEffect } from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
  Badge,
  Divider,
  RadioGroup,
  Radio,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Input
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useCart, PaymentMethod } from "../components/CartContext";
import { generateQrisBase64 } from "@/components/qris";
import { Product } from "../types";
import { OUTLETS } from "@/config/outlets";

// Helper: ambil harga unit dari DB berdasarkan size
function getUnitPriceFromDB(product: Product, size: "regular" | "large") {
  const basePrice =
    size === "large"
      ? product.price_large ?? product.price
      : product.price;

  if (product.discount && product.discount > 0) {
    return Math.round(basePrice * (1 - product.discount / 100));
  }
  return basePrice;
}

export const CartDropdown: React.FC = () => {
  const {
  cartItems,
  removeFromCart,
  updateQuantity,
  totalItems,
  paymentMethod,
  setPaymentMethod,
  clearCart,
  outletId,
  setOutletId,
  tableNumber,
  setTableNumber,
  customerName,
  setCustomerName,
} = useCart();

const outlet = OUTLETS.find((o) => o.id === outletId);

  // Hitung total dari cart berdasarkan harga DB + size
  const cartTotal = cartItems.reduce((sum, item) => {
    const unit = getUnitPriceFromDB(item.product as any, item.size);
    return sum + unit * item.quantity;
  }, 0);

  // Modal 1 (QRIS / Cash)
  const {
    isOpen: isOpenFirstModal,
    onOpen: onOpenFirstModal,
    onOpenChange: onOpenChangeFirstModal,
  } = useDisclosure();

  const [qrisDataUri, setQrisDataUri] = useState<string>("");
  const [loadingQris, setLoadingQris] = useState(false);
  const [selectedPayment, setSelectedPayment] =
    useState<PaymentMethod>(paymentMethod);

  const phoneNumber = import.meta.env.VITE_WHATSAPP_NUMBER;

  useEffect(() => {
    if (isOpenFirstModal && selectedPayment === "qris" && cartTotal > 0) {
      setLoadingQris(true);
      generateQrisBase64(cartTotal, 300)
        .then((dataUri) => setQrisDataUri(dataUri))
        .catch((err) => console.error("Gagal generate QRIS:", err))
        .finally(() => setLoadingQris(false));
    }
  }, [isOpenFirstModal, selectedPayment, cartTotal]);

  const handleQuantityChange = (productId: number, change: number) => {
    const item = cartItems.find((i) => i.product.id === productId);
    if (!item) return;
    const nextQty = item.quantity + change;
    updateQuantity(productId, item.size, nextQty);
  };

  const handlePaymentChange = (value: string) => {
    setSelectedPayment(value as PaymentMethod);
  };

  const handleCheckout = () => {
    if (!selectedPayment) return;
    setPaymentMethod(selectedPayment);
    onOpenFirstModal();
  };

  // ===== Download QR sebagai gambar =====
  const handleDownloadQris = () => {
    if (!qrisDataUri) return;
    const link = document.createElement("a");
    link.href = qrisDataUri;
    link.download = `QRIS-KopiKabel-Rp${cartTotal}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Modal 2 (Konfirmasi & kirim WA)
  const {
    isOpen: isOpenSecondModal,
    onOpen: onOpenSecondModal,
    onOpenChange: onOpenChangeSecondModal,
  } = useDisclosure();

  const [selectedCashOption, setSelectedCashOption] = useState<string>("");
  const [inputAmount, setInputAmount] = useState<string>("");

  const handleConfirmOrder = () => {
    onOpenChangeFirstModal(); // close modal 1
    onOpenSecondModal(); // open modal 2
    setSelectedCashOption("");
    setInputAmount("");
  };

  return (
    <>
      {/* ========== Dropdown Keranjang ========== */}
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Button
            isIconOnly
            variant="light"
            aria-label="Shopping Cart"
            className="relative"
          >
            <Icon icon="lucide:shopping-cart" className="text-xl" />
            {totalItems > 0 && (
              <Badge
                color="danger"
                shape="circle"
                size="sm"
                className="absolute -top-1 -right-1"
              >
                {totalItems}
              </Badge>
            )}
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Cart Items"
          className="w-80"
          disallowEmptySelection
        >
          {/* Judul */}
          <DropdownItem
            key="cart-title"
            isReadOnly
            className="py-2"
            textValue="Shopping Cart"
          >
            <p className="text-lg font-semibold">Shopping Cart</p>
          </DropdownItem>
          <DropdownItem key="divider-1" isReadOnly textValue="Divider">
            <Divider />
          </DropdownItem>

          {/* Jika keranjang kosong */}
          {cartItems.length === 0 ? (
            <DropdownItem
              key="empty-cart"
              isReadOnly
              className="py-4"
              textValue="Your cart is empty"
            >
              <div className="flex flex-col items-center justify-center">
                <Icon
                  icon="lucide:shopping-cart"
                  className="text-3xl text-default-400 mb-2"
                />
                <p className="text-default-500">Your cart is empty</p>
              </div>
            </DropdownItem>
          ) : (
            <>
              {/* Daftar item */}
              {cartItems.map((item) => {
                return (
                  <DropdownItem
                    key={`${item.product.id}-${item.size}`}
                    isReadOnly
                    className="py-2"
                    textValue={`${item.product.name} x ${item.quantity}`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          item.product.image_url ||
                          "https://placehold.co/48x48/e2e8f0/e2e8f0?text=No-Image"
                        }
                        alt={item.product.name}
                        className="w-12 h-12 object-cover rounded-md"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium line-clamp-1">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-default-500">
                          Size: {item.size}
                          <br />
                          {item.product.discount && item.product.discount > 0 ? (
                            <>
                              <span className="line-through text-red-400">
                                Rp {(
                                  (item.size === "large"
                                    ? item.product.price_large ?? item.product.price
                                    : item.product.price
                                  ) * item.quantity
                                ).toLocaleString("id-ID")}
                              </span>
                              {" "}
                              <span className="text-green-500 font-bold">
                                Rp {(getUnitPriceFromDB(item.product, item.size) * item.quantity).toLocaleString("id-ID")}
                              </span>
                            </>
                          ) : (
                            <>Rp {getUnitPriceFromDB(item.product, item.size).toLocaleString("id-ID")} x {item.quantity}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          onPress={() =>
                            handleQuantityChange(item.product.id, -1)
                          }
                        >
                          <Icon
                            icon="lucide:minus"
                            style={{ fontSize: 14 }}
                          />
                        </Button>
                        <span className="text-sm w-6 text-center">
                          {item.quantity}
                        </span>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          onPress={() =>
                            handleQuantityChange(item.product.id, 1)
                          }
                        >
                          <Icon icon="lucide:plus" style={{ fontSize: 14 }} />
                        </Button>
                      </div>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() =>
                          removeFromCart(item.product.id, item.size)
                        }
                      >
                        <Icon
                          icon="lucide:trash-2"
                          style={{ fontSize: 14 }}
                        />
                      </Button>
                    </div>
                  </DropdownItem>
                );
              })}

              <DropdownItem key="divider-2" isReadOnly textValue="Divider">
                <Divider />
              </DropdownItem>

              {/* Total Harga */}
              <DropdownItem
                key="total"
                isReadOnly
                className="py-2"
                textValue={`Total: Rp ${cartTotal.toLocaleString("id-ID")}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold">
                    Rp {cartTotal.toLocaleString("id-ID")}
                  </span>
                </div>
              </DropdownItem>

              {/* Pilih Metode Pembayaran */}
              <DropdownItem
                key="payment-method"
                isReadOnly
                className="py-2"
                textValue="Payment Method"
              >
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Payment Method:</p>
                  <RadioGroup
                    orientation="horizontal"
                    value={selectedPayment || ""}
                    onValueChange={handlePaymentChange}
                  >
                    <Radio value="cash">Cash</Radio>
                    <Radio value="qris">QRIS</Radio>
                  </RadioGroup>
                </div>
              </DropdownItem>

              {/* Tombol Checkout */}
              <DropdownItem
                key="checkout"
                isReadOnly
                className="py-2"
                textValue="Checkout"
              >
                <Button
                  color="primary"
                  className="w-full"
                  isDisabled={!selectedPayment}
                  onPress={handleCheckout}
                >
                  Checkout
                </Button>
              </DropdownItem>
            </>
          )}
        </DropdownMenu>
      </Dropdown>

      {/* ========== Modal QRIS / Cash ========== */}
      <Modal isOpen={isOpenFirstModal} onOpenChange={onOpenChangeFirstModal}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {paymentMethod === "qris"
                  ? "Scan QR Code to Pay"
                  : "Cash Payment"}
              </ModalHeader>
              <ModalBody>
                <RadioGroup
                  label="Lantai"
                  orientation="horizontal"
                  isRequired
                  value={outletId ? String(outletId) : ""}
                  onValueChange={(v) => setOutletId(Number(v))}
                >
                  {OUTLETS.map((o) => (
                    <Radio key={o.id} value={String(o.id)}>
                      {o.name}
                    </Radio>
                  ))}
                </RadioGroup>
                <Input label="Nama" isRequired value={customerName} onValueChange={setCustomerName} />
                <Input label="Nomor meja (opsional)" value={tableNumber} onValueChange={setTableNumber} />
                {paymentMethod === "qris" ? (
                  <div className="flex flex-col items-center">
                    <div className="border border-default-200 p-4 rounded-lg mb-4">
                      {loadingQris ? (
                        <p>Memuat QRIS…</p>
                      ) : (
                        <img
                          src={qrisDataUri}
                          alt={`QRIS untuk Rp${cartTotal.toLocaleString(
                            "id-ID"
                          )}`}
                          className="w-64 h-64 object-contain"
                        />
                      )}
                    </div>
                    <p className="text-center text-default-500 mb-3">
                      Scan kode di atas untuk membayar Rp
                      {cartTotal.toLocaleString("id-ID")}
                    </p>

                    {/* Tombol Download QR */}
                    {!loadingQris && qrisDataUri && (
                      <Button
                        size="sm"
                        variant="flat"
                        color="default"
                        startContent={<Icon icon="lucide:download" />}
                        onPress={handleDownloadQris}
                      >
                        Download QR
                      </Button>
                    )}
                    <p className="text-center text-xs text-default-400 mt-2">
                      Simpan gambar ini lalu buka sendiri aplikasi
                      Bank/e-wallet Anda untuk scan dari galeri.
                      Setelah melakukan pembayaran, Harap kembali ke web untuk 
                      konfirmasi dan melanjutkan pesanan
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Icon
                      icon="lucide:banknote"
                      className="text-6xl text-success mb-4"
                    />
                    <p className="text-center text-default-500">
                      Silahkan siapkan uang sebesar Rp.
                      {cartTotal.toFixed(0)} untuk pembayaran
                    </p>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleConfirmOrder}>
                  Confirm Order
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ========== Modal Konfirmasi Order ========== */}
      <Modal isOpen={isOpenSecondModal} onOpenChange={onOpenChangeSecondModal}>
        <ModalContent>
          {(onClosePrompt) => (
            <>
              <ModalHeader>Konfirmasi Order</ModalHeader>
              <ModalBody>
                {paymentMethod === "qris" ? (
                  <p>
                    Silahkan konfirmasi orderan Anda. Jika Anda menggunakan
                    QRIS maka lampirkan bukti pembayarannya. Jika ada pesan
                    lainnya, tolong tambahkan setelah mengirim pesan ini.
                  </p>
                ) : (
                  <CashConfirmForm
                    selectedCashOption={selectedCashOption}
                    setSelectedCashOption={setSelectedCashOption}
                    inputAmount={inputAmount}
                    setInputAmount={setInputAmount}
                  />
                )}
              </ModalBody>
              <ModalFooter className="gap-2">
                <Button
                  color="danger"
                  variant="light"
                  onPress={() => onClosePrompt()}
                >
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isDisabled={
                    !outletId ||
                    !customerName.trim() ||
                    (paymentMethod === "cash" &&
                      (!selectedCashOption ||
                        (selectedCashOption === "input_amount" && !inputAmount)))
                  }
                  onPress={() => {
                    // susun pesan WhatsApp
                    const itemsLines = cartItems.map((item) => {
                      const unit = getUnitPriceFromDB(
                        item.product as any,
                        item.size
                      );
                      return `${item.product.name} (${item.size}) x${
                        item.quantity
                      } = Rp.${(unit * item.quantity).toFixed(0)}`;
                    });
                    const totalLine = `Total: Rp.${cartTotal.toFixed(0)}`;
                    if (!phoneNumber) return;
                    const headerLines = [
                      `Outlet: ${outlet?.name ?? "-"}`,
                      `Nama: ${customerName.trim()}`,
                      tableNumber ? `Meja: ${tableNumber}` : null,
                      `Pembayaran: ${(paymentMethod ?? "").toUpperCase()}`,
                      "",
                    ].filter((l): l is string => l !== null);


                    if (paymentMethod === "qris") {
                      const text = [...headerLines, ...itemsLines, totalLine].join("\n");
                      const url = `https://api.whatsapp.com/send/?phone=${phoneNumber}&text=${encodeURIComponent(
                        text
                      )}`;
                      window.open(url, "_blank");
                      clearCart();
                      onClosePrompt();
                    } else {
                      let uangLine = "";
                      if (selectedCashOption === "input_amount") {
                        uangLine = `Jumlah Uang yang akan dibayarkan: Rp.${inputAmount}`;
                      } else if (selectedCashOption === "100") {
                        uangLine = `Jumlah Uang yang akan dibayarkan: Rp.100000`;
                      } else if (selectedCashOption === "50") {
                        uangLine = `Jumlah Uang yang akan dibayarkan: Rp.50000`;
                      }

                      const text = [...headerLines, ...itemsLines, totalLine, uangLine].join("\n");
                      const url = `https://api.whatsapp.com/send/?phone=${phoneNumber}&text=${encodeURIComponent(
                        text
                      )}`;
                      window.open(url, "_blank");
                      clearCart();
                      onClosePrompt();
                    }
                  }}
                >
                  Konfirmasi
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

// Komponen kecil untuk form pilihan uang cash (agar file lebih rapi)
function CashConfirmForm(props: {
  selectedCashOption: string;
  setSelectedCashOption: (v: string) => void;
  inputAmount: string;
  setInputAmount: (v: string) => void;
}) {
  const {
    selectedCashOption,
    setSelectedCashOption,
    inputAmount,
    setInputAmount,
  } = props;

  return (
    <div className="flex flex-col gap-4">
      <p>Pilih Pecahan Uang yang akan dibayarkan:</p>
      <RadioGroup
        orientation="vertical"
        value={selectedCashOption}
        onValueChange={(val) => {
          setSelectedCashOption(val);
          if (val !== "input_amount") setInputAmount("");
        }}
      >
        <Radio value="100" className="mb-2">
          Rp. 100.000
        </Radio>
        <Radio value="50" className="mb-2">
          Rp. 50.000
        </Radio>
        <Radio value="input_amount" className="mb-2">
          Input jumlah (masukkan angka)
        </Radio>
      </RadioGroup>

      {selectedCashOption === "input_amount" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="inputAmount" className="text-sm font-medium">
            Masukkan angka:
          </label>
          <input
            id="inputAmount"
            type="number"
            min="0"
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            className="border border-default-200 rounded-md p-2"
            placeholder="Contoh: 20000"
          />
        </div>
      )}
    </div>
  );
}

export default CartDropdown;