import { useState, useEffect } from "react";
import {
  uploadProductImage,
  getProductsWithCategories,
  addProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} from "../../api/menuApi";
import { Product, Category } from "../../types";
import { ProductForm } from "../../features/admin/menu/ProductForm";

import {
  Button,
  Card,
  CardBody,
  Chip,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from "@heroui/react";

const MenuManagementPage = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, categoriesData] = await Promise.all([
        getProductsWithCategories(),
        getCategories(),
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("Anda yakin ingin menghapus produk ini?")) {
      try {
        await deleteProduct(id);
        loadData();
      } catch (err: any) {
        alert("Gagal menghapus produk: " + err.message);
      }
    }
  };

  const handleFormSubmit = async (
    productData: Omit<Product, "id" | "created_at" | "image_url">,
    imageFile: File | null
  ) => {
    setIsSubmitting(true);
    try {
      let imageUrl = editingProduct?.image_url || null;
      if (imageFile) {
        imageUrl = await uploadProductImage(imageFile);
      }
      const finalProductData = { ...productData, image_url: imageUrl };
      if (editingProduct) {
        await updateProduct(editingProduct.id, finalProductData);
      } else {
        await addProduct(finalProductData as any);
      }
      handleCloseModal();
      loadData();
    } catch (err: any) {
      alert("Gagal menyimpan produk: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="p-4 sm:p-6 flex items-center gap-2">
        <Spinner size="sm" /> Memuat menu...
      </div>
    );
  if (error)
    return (
      <Card className="m-4 sm:m-6">
        <CardBody className="text-red-500">Error: {error}</CardBody>
      </Card>
    );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Menu</h1>
          <p className="text-default-500">
            Tambah, ubah, dan hapus produk beserta kategorinya.
          </p>
        </div>
        <Button color="primary" onPress={handleOpenAddModal}>
          + Tambah Produk
        </Button>
      </div>

      {/* MOBILE: Card list */}
      <div className="space-y-3 sm:hidden">
        {products.map((product) => (
          <Card key={product.id} shadow="sm">
            <CardBody className="flex gap-3 items-start">
              <img
                src={
                  product.image_url ||
                  "https://placehold.co/100x100/e2e8f0/e2e8f0?text=No-Image"
                }
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="w-16 h-16 object-cover rounded-md shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {product.name}
                </div>
                {/* Tambahkan diskon */}
                {product.discount ? (
                  <div className="mt-1">
                    <Chip size="sm" color="warning" variant="flat">
                      Diskon {product.discount}%
                    </Chip>
                  </div>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Chip size="sm" color="success" variant="flat">
                    {product.categories?.name || "Uncategorized"}
                  </Chip>
                  <span className="text-sm text-default-600">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                    }).format(product.price)}
                    {product.price_large
                      ? ` / Large: ${new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                        }).format(product.price_large)}`
                      : ""}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => handleOpenEditModal(product)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    color="danger"
                    variant="light"
                    onPress={() => handleDelete(product.id)}
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
        {products.length === 0 && (
          <Card>
            <CardBody className="text-center text-default-500">
              Belum ada produk.
            </CardBody>
          </Card>
        )}
      </div>

      {/* DESKTOP/TABLET: Table */}
      <Card className="hidden sm:block">
        <CardBody className="overflow-x-auto">
          <Table aria-label="Daftar produk" removeWrapper>
            <TableHeader>
              <TableColumn>Gambar</TableColumn>
              <TableColumn>Nama</TableColumn>
              <TableColumn>Kategori</TableColumn>
              <TableColumn>Harga</TableColumn>
              <TableColumn>Diskon</TableColumn>
              <TableColumn className="text-right">Aksi</TableColumn>
            </TableHeader>

            <TableBody emptyContent="Belum ada produk." items={products}>
              {(product: any) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <img
                      src={
                        product.image_url ||
                        "https://placehold.co/100x100/e2e8f0/e2e8f0?text=No-Image"
                      }
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      className="w-16 h-16 object-cover rounded-md"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{product.name}</div>
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" color="success" variant="flat">
                      {product.categories?.name || "Uncategorized"}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                        }).format(product.price)}{" "}
                        (Regular)
                      </div>
                      {product.price_large && (
                        <div className="text-default-500 text-sm">
                          Large:{" "}
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                          }).format(product.price_large)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {product.discount ? (
                      <Chip size="sm" color="warning" variant="flat">
                        {product.discount}%
                      </Chip>
                    ) : (
                      <span className="text-default-400 text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => handleOpenEditModal(product)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      color="danger"
                      variant="light"
                      onPress={() => handleDelete(product.id)}
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

      {/* Modal tambah/edit (HeroUI) */}
      <Modal
        isOpen={isModalOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseModal();
        }}
        placement="center"
        size="lg"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingProduct ? "Edit Produk" : "Tambah Produk Baru"}
              </ModalHeader>
              <ModalBody>
                <ProductForm
                  onSubmit={handleFormSubmit}
                  onCancel={() => {
                    onClose();
                    handleCloseModal();
                  }}
                  initialData={editingProduct}
                  categories={categories}
                  isSubmitting={isSubmitting}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default MenuManagementPage;
