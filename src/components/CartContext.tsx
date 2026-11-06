// --- FILE: src/components/CartContext.tsx (UPDATED: outlet, meja, nama pelanggan) ---

import React, { createContext, useContext, useState } from "react";
import { Product } from "../types/";
import { isValidOutletId } from "../config/outlets";

// Define cart item type (product + quantity)
export interface CartItem {
  product: Product;
  size: "regular" | "large";
  quantity: number;
}

// Define payment method type
export type PaymentMethod = "cash" | "qris" | null;

// Define cart context type
interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, size: "regular" | "large", quantity?: number) => void;
  removeFromCart: (productId: number, size: "regular" | "large") => void;
  updateQuantity: (productId: number, size: "regular" | "large", quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  // [BARU] info pelanggan untuk pesan WhatsApp
  outletId: number | null;
  setOutletId: (id: number | null) => void;
  tableNumber: string;
  setTableNumber: (v: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
}

// Create context with default values
const CartContext = createContext<CartContextType>({
  cartItems: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  totalItems: 0,
  totalPrice: 0,
  paymentMethod: null,
  setPaymentMethod: () => {},
  outletId: null,
  setOutletId: () => {},
  tableNumber: "",
  setTableNumber: () => {},
  customerName: "",
  setCustomerName: () => {},
});

// Custom hook to use cart context
export const useCart = () => useContext(CartContext);

// [BARU] Baca outlet dari link QR (?outlet=1) atau dari sesi tab ini.
// Memakai sessionStorage (bukan localStorage) agar pilihan tidak "menempel"
// di HP pelanggan untuk kunjungan berikutnya.
const readOutlet = (): number | null => {
  try {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("outlet"));
    if (isValidOutletId(fromUrl)) {
      sessionStorage.setItem("kk_outlet", String(fromUrl));
      return fromUrl;
    }
    const saved = Number(sessionStorage.getItem("kk_outlet"));
    return isValidOutletId(saved) ? saved : null;
  } catch {
    return null;
  }
};

// [BARU] Baca nomor meja dari link QR (?meja=5)
const readTable = (): string => {
  try {
    const t = new URLSearchParams(window.location.search).get("meja");
    if (t) {
      const clean = t.slice(0, 10);
      sessionStorage.setItem("kk_table", clean);
      return clean;
    }
    return sessionStorage.getItem("kk_table") ?? "";
  } catch {
    return "";
  }
};

// Cart provider component
export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);

  const [outletId, setOutletIdState] = useState<number | null>(readOutlet);
  const [tableNumber, setTableNumber] = useState<string>(readTable);
  const [customerName, setCustomerName] = useState<string>("");

  const setOutletId = (id: number | null) => {
    setOutletIdState(id);
    try {
      if (id) sessionStorage.setItem("kk_outlet", String(id));
      else sessionStorage.removeItem("kk_outlet");
    } catch {
      /* abaikan bila storage diblokir */
    }
  };

  // Add product to cart
  const addToCart = (
    product: Product,
    size: "regular" | "large",
    quantity: number = 1
  ) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find(
        (item) => item.product.id === product.id && item.size === size
      );

      if (existingItem) {
        // kalau sudah ada, update quantity
        return prevItems.map((item) =>
          item.product.id === product.id && item.size === size
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        return [...prevItems, { product, size, quantity }];
      }
    });
  };

  // Remove product from cart
  const removeFromCart = (productId: number, size: "regular" | "large") => {
    setCartItems((prevItems) =>
      prevItems.filter((item) => !(item.product.id === productId && item.size === size))
    );
  };

  // Update quantity of a product
  const updateQuantity = (
    productId: number,
    size: "regular" | "large",
    quantity: number
  ) => {
    if (quantity <= 0) {
      setCartItems((prev) =>
        prev.filter((item) => !(item.product.id === productId && item.size === size))
      );
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId && item.size === size
          ? { ...item, quantity }
          : item
      )
    );
  };

  // Clear cart (outlet, meja, dan nama sengaja TIDAK direset)
  const clearCart = () => {
    setCartItems([]);
    setPaymentMethod(null);
  };

  // Calculate total items in cart
  const totalItems = cartItems.reduce((total, item) => total + item.quantity, 0);

  // Calculate total price
  const totalPrice = cartItems.reduce((total, item) => {
    const price =
      item.size === "large" && item.product.price_large
        ? item.product.price_large
        : item.product.price;
    return total + price * item.quantity;
  }, 0);

  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    paymentMethod,
    setPaymentMethod,
    outletId,
    setOutletId,
    tableNumber,
    setTableNumber,
    customerName,
    setCustomerName,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};