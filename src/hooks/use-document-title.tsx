import { useEffect } from "react";

const BRAND = "Luize Blond";
const DEFAULT_DESCRIPTION = "Luize Blond — Chief of Staff Digital";

function setMeta(selector: string, attr: "content", value: string) {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute(attr, value);
}

export function useDocumentTitle(pageTitle?: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    const fullTitle = pageTitle ? `${pageTitle} · ${BRAND}` : BRAND;
    document.title = fullTitle;

    const desc = description ?? DEFAULT_DESCRIPTION;
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", fullTitle);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[name="twitter:title"]', "content", fullTitle);
    setMeta('meta[name="twitter:description"]', "content", desc);

    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle, description]);
}
