import { router } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { extractUrl, fetchLinkPreview } from '@/lib/link-preview';
import { saveWishImage } from '@/lib/wish-image';
import { colors } from '@/theme/tokens';

/**
 * Arrivée d'un partage (Partager → My Personal Life) : un lien ou une capture d'écran.
 * On lit le lien (nom, prix, image) ou on garde l'image, puis on ouvre « Nouvelle envie » pré-remplie.
 */
export default function ShareReceiver() {
  // Données brutes du partage : disponibles tout de suite (texte, lien, adresse de l'image).
  const { sharedPayloads, clearSharedPayloads } = useIncomingShare();
  const done = useRef(false);

  // Rien reçu au bout de 3 s (ouverture directe) : formulaire vide.
  useEffect(() => {
    const t = setTimeout(() => {
      if (done.current) return;
      done.current = true;
      router.replace('/envie/nouvelle');
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (done.current || sharedPayloads.length === 0) return;
    done.current = true;
    (async () => {
      const params: Record<string, string> = {};
      const image = sharedPayloads.find((p) => (p.shareType === 'image' || p.mimeType?.startsWith('image/')) && p.value);
      const text = sharedPayloads.map((p) => (p.shareType === 'text' || p.shareType === 'url' ? p.value ?? '' : '')).join(' ').trim();
      const url = extractUrl(text);
      if (image?.value) {
        try {
          params.image = await saveWishImage(image.value, image.mimeType);
          params.source = 'screen';
        } catch {
          // Image illisible : l'envie se crée sans.
        }
      }
      if (url) {
        params.url = url;
        const preview = await fetchLinkPreview(url);
        // Beaucoup d'apps partagent « Nom du produit https://… » : le texte sert de nom de secours.
        const fallback = text.replace(url, '').replace(/\s+/g, ' ').trim();
        const title = preview.title ?? (fallback.length >= 3 ? fallback.slice(0, 120) : null);
        if (title) params.title = title;
        if (preview.priceCents !== null) params.price = String(preview.priceCents);
        if (!params.image && preview.imageUrl) {
          params.image = preview.imageUrl;
          params.source = 'lien';
        }
      } else if (text && !params.title) {
        params.title = text.slice(0, 120);
      }
      clearSharedPayloads();
      router.replace({ pathname: '/envie/nouvelle', params });
    })();
  }, [sharedPayloads, clearSharedPayloads]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.textSecondary} />
      <AppText variant="body" color={colors.textSecondary}>
        Préparation de l&apos;envie…
      </AppText>
    </View>
  );
}
