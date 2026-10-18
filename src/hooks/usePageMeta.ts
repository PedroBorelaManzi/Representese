import { useEffect } from "react";

const DEFAULT_TITLE = "Sistema para Representantes Comerciais | Represente-Se!";
const DEFAULT_DESCRIPTION =
  "Sistema para representante comercial: controle de pedidos, carteira de clientes, comissões e agenda de visitas num só app. Feito para quem representa várias marcas.";
const SITE_URL = "https://www.representese.com";

function setMetaContent(selector: string, content: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute("content", content);
}

function setCanonical(href: string) {
  const el = document.head.querySelector('link[rel="canonical"]');
  if (el) el.setAttribute("href", href);
}

/**
 * Título/descrição/canonical por rota. Sem isso, toda página pública (login,
 * cadastro, planos...) herdava os mesmos valores fixos do index.html — pro
 * Google isso lê como "a página de verdade é a home", o que atrapalha essas
 * páginas aparecerem sozinhas numa busca. Restaura os valores padrão ao sair
 * da página, pra não vazar um título de rota antiga pra outra tela que não
 * chama este hook.
 */
export function usePageMeta(title: string, description?: string, path?: string) {
  useEffect(() => {
    const fullTitle = `${title} | Represente-Se!`;
    document.title = fullTitle;
    if (description) {
      setMetaContent('meta[name="description"]', description);
      setMetaContent('meta[property="og:description"]', description);
      setMetaContent('meta[name="twitter:description"]', description);
    }
    setMetaContent('meta[property="og:title"]', fullTitle);
    setMetaContent('meta[name="twitter:title"]', fullTitle);
    if (path) {
      const url = `${SITE_URL}${path}`;
      setCanonical(url);
      setMetaContent('meta[property="og:url"]', url);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      setMetaContent('meta[name="description"]', DEFAULT_DESCRIPTION);
      setMetaContent('meta[property="og:description"]', DEFAULT_DESCRIPTION);
      setMetaContent('meta[property="og:title"]', DEFAULT_TITLE);
      setMetaContent('meta[name="twitter:title"]', DEFAULT_TITLE);
      setCanonical(`${SITE_URL}/`);
      setMetaContent('meta[property="og:url"]', `${SITE_URL}/`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path]);
}
