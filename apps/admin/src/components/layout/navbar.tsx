import { LogOut, Menu } from "lucide-react";
import { useAuth } from "../../hooks/use-auth";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../language-switcher";

interface NavbarProps {
  onMobileMenuToggle: () => void;
}

export function Navbar({ onMobileMenuToggle }: NavbarProps) {
  const { logout } = useAuth();
  const { t } = useTranslation();

  return (
    <header className="fixed top-0 inset-x-0 z-30 h-16 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuToggle}
            aria-label="Toggle menu"
            className="lg:hidden h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>{t("navbar.logout")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
