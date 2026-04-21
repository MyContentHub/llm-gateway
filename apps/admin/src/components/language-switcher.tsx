import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === "en" ? "zh-CN" : "en";
    i18n.changeLanguage(nextLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="text-sm font-medium"
    >
      {i18n.language === "en" ? "EN" : "中文"}
    </Button>
  );
}
