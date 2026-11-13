// src/layouts/AdminLayout.tsx
import { useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/hooks/useAuth";
import { useProfile } from "../auth/hooks/useProfile";
import {
  Button,
  Link as UiLink,
  Divider,
} from "@heroui/react";
import { Link as HeroLink } from "@heroui/link";

const MenuIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg {...props} stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24"
    strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

type NavDef = { to: string; label: string };
const NAVS: NavDef[] = [
  { to: "/app/admin/dashboard", label: "Dashboard" },
  { to: "/app/admin/menu", label: "Menu" },
  { to: "/app/admin/baristas", label: "Kelola Barista" },
  { to: "/app/admin/orders", label: "Riwayat Order" },
  { to: "/app/admin/finance", label: "Keuangan" }, 
  { to: "/app/admin/stock", label: "Stok Bahan" },
  
  
];

function useActiveMatcher() {
  const { pathname } = useLocation();
  return (to: string) => pathname === to || pathname.startsWith(to + "/");
}

export default function AdminLayout() {
  const { logout } = useAuth();
  const { profile } = useProfile();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isActive = useActiveMatcher();

  const handleLogout = () => {
    // tutup sidebar jika sedang di mobile overlay, lalu logout
    setIsSidebarOpen(false);
    logout();
  };

  const SideLinks = useMemo(
    () =>
      NAVS.map((n) => {
        const active = isActive(n.to);
        return (
          <Button
            key={n.to}
            as={Link}
            to={n.to}
            fullWidth
            type="button"
            variant={active ? "flat" : "light"}
            color={active ? "primary" : "default"}
            className="justify-start"
            onPress={() => setIsSidebarOpen(false)}
          >
            {n.label}
          </Button>
        );
      }),
    [isActive]
  );

  const SidebarContent = (
    <div className="flex flex-col h-full relative z-10"> {/* z-10 agar di atas dekorasi */}
      <div className="p-4">
        <UiLink
          as={Link}
          to="/app/admin/dashboard"
          color="primary"
          className="text-2xl font-bold"
          onPress={() => setIsSidebarOpen(false)}
        >
          KopiKabel Admin
        </UiLink>
        <p className="text-sm text-default-500">
          Welcome, {profile?.full_name || "Admin"}
        </p>
      </div>

      <Divider />

      <div className="px-3 py-2 flex-1 overflow-y-auto">
        <div className="space-y-2">{SideLinks}</div>
      </div>

      <Divider />

      <div className="p-4 relative z-10">
        <Button
          color="danger"
          fullWidth
          type="button"
          onPress={handleLogout}      // <- perbaikan utama
          onClick={handleLogout}      // <- fallback kalau onPress tidak terpasang
        >
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white shadow-md flex-shrink-0">
        {SidebarContent}
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar mobile */}
        <header className="md:hidden bg-white shadow-sm flex justify-between items-center p-4">
          <UiLink
            as={Link}
            to="/app/admin/dashboard"
            color="primary"
            className="text-xl font-bold"
            onPress={() => setIsSidebarOpen(false)}
            aria-label="Buka Dashboard Admin"
          >
            KopiKau Admin
          </UiLink>
          <Button
            isIconOnly
            variant="light"
            type="button"
            onPress={() => setIsSidebarOpen((s) => !s)}
            aria-label="Toggle menu"
          >
            <MenuIcon className="h-6 w-6" />
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto min-w-0">
          <Outlet />
        </main>

        <footer className="bg-white border-t w-full flex items-center justify-center py-3">
          <HeroLink
            isExternal
            className="flex items-center gap-1 text-current"
            href="https://www.instagram.com/zidni_mufti/"
          >
            <span className="text-default-600">Powered by</span>
            <p className="text-primary">Orang Ganteng</p>
          </HeroLink>
        </footer>
      </div>

      {/* Sidebar mobile (overlay) */}
      {isSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <aside
            className="w-64 bg-white shadow-md flex flex-col z-50" // <- di atas overlay
            role="dialog"
            aria-label="Sidebar menu"
          >
            {SidebarContent}
          </aside>
          <div
            className="flex-1 bg-black/50 z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
