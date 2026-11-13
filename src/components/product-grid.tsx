import React, { useEffect, useState } from "react";
import { Card, CardBody, CardFooter, Button, Radio, RadioGroup, Chip } from "@heroui/react";
import { Product, Category } from "../types";
import { useNavigate } from "react-router-dom";
import { useCart } from "../components/CartContext";
import { Icon } from "@iconify/react";
import { supabase } from "../api/supabaseClient";

interface ProductGridProps {
  products: Product[];
}

export const ProductGrid: React.FC<ProductGridProps> = ({ products }) => {
  const history = useNavigate();
  const { addToCart } = useCart();
  const [selectedSizes, setSelectedSizes] = useState<{ [productId: number]: "regular" | "large" }>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // ===== State untuk popup notifikasi "berhasil ditambahkan ke keranjang" =====
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Ambil data kategori dari Supabase
  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase.from("categories").select("*").order("id");
      if (error) {
        console.error("Error fetch categories:", error);
      } else {
        setCategories(data || []);
        if (data && data.length > 0) {
          const coffeeCat = data.find((c) => c.name.toLowerCase() === "coffee");
          setSelectedCategory(coffeeCat ? coffeeCat.id : data[0].id);
        }
      }
    };
    fetchCategories();
  }, []);

  // Intersection Observer untuk mendeteksi scroll dan mengubah Chip aktif
  useEffect(() => {
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Ambil ID kategori dari id element html (contoh: "category-1" jadi 1)
          const catId = parseInt(entry.target.id.replace("category-", ""));
          setSelectedCategory(catId);
        }
      });
    };

    // Setting area deteksi (sedikit di atas layar agar transisi lebih natural)
    const observer = new IntersectionObserver(handleIntersect, {
      root: null,
      rootMargin: "-20% 0px -70% 0px",
    });

    // Observasi setiap elemen kategori
    categories.forEach((cat) => {
      const element = document.getElementById(`category-${cat.id}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [categories, products]);

  const handleProductClick = (productId: number) => {
    history(`/product/${productId}`);
  };

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    const selectedSize = selectedSizes[product.id] || "regular";
    addToCart(product, selectedSize);

    // Tampilkan popup notifikasi
    setToastMessage(`${product.name} ditambahkan ke keranjang`);
  };

  // Fungsi untuk scroll otomatis saat Chip diklik
  const scrollToCategory = (categoryId: number) => {
    setSelectedCategory(categoryId); // Update state langsung biar responsif
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      // Offset agar tidak tertutup sticky header
      const y = element.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tombol kategori (Sticky)
          Tambahkan background color (misal bg-white) sesuai tema Anda agar produk yang discroll lewat bawahnya tertutup dengan rapi.
          Di sini saya pakai backdrop-blur agar terlihat modern.
      */}
      <div className="sticky top-[60px] z-40 bg-background/80 backdrop-blur-md py-4 mt-4 flex justify-center gap-3 flex-wrap">
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            color={selectedCategory === cat.id ? "primary" : "default"}
            variant={selectedCategory === cat.id ? "solid" : "flat"}
            onClick={() => scrollToCategory(cat.id)}
            className="cursor-pointer"
          >
            {cat.name}
          </Chip>
        ))}
      </div>

      {/* Kontainer Utama Produk */}
      <div className="flex flex-col gap-12">
        {categories.map((cat) => {
          // Ambil produk HANYA untuk kategori yang sedang di-loop
          const catProducts = products.filter((p) => p.category_id === cat.id);

          // Jika tidak ada produk di kategori ini, lewati (jangan render)
          if (catProducts.length === 0) return null;

          return (
            <div key={cat.id} id={`category-${cat.id}`} className="scroll-mt-24">
              {/* Judul Kategori sebagai pembatas */}
              <h2 className="text-2xl font-bold mb-4 ml-2">{cat.name}</h2>

              {/* Grid Produk per Kategori */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {catProducts.map((product) => {
                  const selectedSize = selectedSizes[product.id] || "regular";
                  const basePrice =
                    selectedSize === "large" && product.price_large
                      ? product.price_large
                      : product.price;
                  const hasDiscount = product.discount !== null && product.discount > 0;
                  const discountedPrice = hasDiscount
                    ? Math.round(basePrice * (1 - product.discount! / 100))
                    : basePrice;

                  return (
                    <Card
                      key={product.id}
                      className="border border-default-200 cursor-pointer"
                      onPress={() => handleProductClick(product.id)}
                    >
                      <CardBody className="p-0 overflow-hidden">
                        <div className="relative">
                          {hasDiscount && (
                            <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow z-10">
                              -{product.discount}%
                            </span>
                          )}
                          <img
                            src={
                              product.image_url ||
                              "https://placehold.co/300x256/e2e8f0/e2e8f0?text=No-Image"
                            }
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-40 sm:h-64 object-cover"
                          />
                        </div>
                      </CardBody>
                      <CardFooter className="flex flex-col items-start gap-2 p-3 sm:p-4">
                        <h3 className="font-semibold text-md">{product.name}</h3>
                        <p className="text-xs text-default-500 line-clamp-2 h-8">
                          {product.description}
                        </p>

                        <RadioGroup
                          orientation="horizontal"
                          value={selectedSize}
                          size="sm"
                          onValueChange={(val) =>
                            setSelectedSizes((prev) => ({
                              ...prev,
                              [product.id]: val as "regular" | "large",
                            }))
                          }
                        >
                          <Radio value="regular">Regular</Radio>
                          <Radio value="large" isDisabled={!product.price_large}>
                            Large
                          </Radio>
                        </RadioGroup>

                        <div className="flex items-center justify-between w-full mt-2">
                          <div className="flex flex-col">
                            {product.discount && (
                              <span className="text-xs text-red-400 line-through">
                                {new Intl.NumberFormat("id-ID", {
                                  style: "currency",
                                  currency: "IDR",
                                }).format(basePrice)}
                              </span>
                            )}
                            <span
                              className={`font-bold ${
                                product.discount ? "text-green-500 text-lg" : "text-default-800"
                              }`}
                            >
                              {new Intl.NumberFormat("id-ID", {
                                style: "currency",
                                currency: "IDR",
                              }).format(product.discount ? discountedPrice : basePrice)}
                            </span>
                          </div>

                          <Button
                            size="sm"
                            color="primary"
                            variant="flat"
                            className="h-7 px-2 min-w-0 text-[10px] sm:h-8 sm:px-3 sm:text-xs"
                            endContent={<Icon icon="lucide:shopping-cart" />}
                            onClick={(e) => handleAddToCart(e, product)}
                          >
                            Add
                          </Button>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== Popup Notifikasi "Berhasil ditambahkan ke keranjang" ===== */}
      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background
                     px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4"
          role="status"
          aria-live="polite"
        >
          <Icon icon="lucide:check-circle" className="text-lg" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};