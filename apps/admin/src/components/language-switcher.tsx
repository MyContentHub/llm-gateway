import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

const languages = [
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "zh-CN", label: "中文", flag: "🇨🇳" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = languages.find((lang) => lang.code === i18n.language) || languages[0];

  const toggleLanguage = () => {
    const nextLang = i18n.language === "en" ? "zh-CN" : "en";
    i18n.changeLanguage(nextLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2 text-sm"
    >
      <Globe className="h-4 w-4" />
      <span>{currentLang.flag}</span>
      <span className="hidden sm:inline">{currentLang.label}</span>
    </Button>
  );
}
