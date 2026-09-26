/*
 * Aperçu d'un lien : nom, prix et image lus dans la page (balises Open Graph, données produit
 * schema.org, <title>). Au mieux : beaucoup de boutiques ne donnent pas tout, ou bloquent.
 */

export type LinkPreview = { title: string | null; priceCents: number | null; imageUrl: string | null };

const TIMEOUT_MS = 8000;

/** Premier lien http(s) d'un texte (ex. un partage « Regarde ça https://… »). */
export function extractUrl(text: string) {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,;!?]+$/, '') : null;
}

/** Domaine lisible : « www.fnac.com/… » → « fnac.com ». */
export function hostOf(url: string) {
  const m = url.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].replace(/^www\./, '') : url;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-FR,fr;q=0.9' },
    });
    if (!res.ok) return { title: null, priceCents: null, imageUrl: null };
    const html = (await res.text()).slice(0, 600_000);
    return {
      title: cleanTitle(meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? titleTag(html)),
      priceCents: price(html),
      imageUrl: absolute(meta(html, 'og:image') ?? meta(html, 'twitter:image') ?? meta(html, 'og:image:url'), res.url || url),
    };
  } catch {
    return { title: null, priceCents: null, imageUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Contenu d'une balise <meta property|name|itemprop="key" content="…">, dans n'importe quel ordre d'attributs. */
function meta(html: string, key: string) {
  const k = key.replace(/[.:]/g, (c) => `\\${c}`);
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content).trim() || null : null;
}

function titleTag(html: string) {
  const t = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return t ? decode(t).trim() || null : null;
}

/** Retire le nom du site en fin de titre (« Casque X | Fnac » → « Casque X »). */
function cleanTitle(t: string | null) {
  if (!t) return null;
  const parts = t.split(/\s+[|–—]\s+|\s+-\s+(?=[^-]+$)/);
  const main = parts[0].trim();
  return (main.length >= 3 ? main : t).slice(0, 120);
}

function price(html: string): number | null {
  const candidates = [
    meta(html, 'product:price:amount'),
    meta(html, 'og:price:amount'),
    meta(html, 'price'),
    html.match(/"price"\s*:\s*"?(\d+(?:[.,]\d{1,2})?)"?/)?.[1] ?? null,
    html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i)?.[1] ?? null,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const n = Number(c.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n < 1_000_000) return Math.round(n * 100);
  }
  return null;
}

function absolute(src: string | null, base: string) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('//')) return `https:${src}`;
  const origin = base.match(/^https?:\/\/[^/]+/i)?.[0];
  return origin ? `${origin}${src.startsWith('/') ? '' : '/'}${src}` : null;
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
