import { useLocalSearchParams } from 'expo-router';

import { WishForm } from '@/components/wish-form';
import { useDbMutation } from '@/db/use-query';
import { createWish, type WishSource } from '@/db/wishes';

/** Nouvelle envie ; pré-remplie par un partage depuis une autre app (voir envie/partage). */
export default function NewWishScreen() {
  const p = useLocalSearchParams<{ url?: string; title?: string; price?: string; image?: string; source?: WishSource }>();
  const mutate = useDbMutation();
  return (
    <WishForm
      title="Nouvelle envie"
      initial={{
        title: p.title ?? '',
        url: p.url ?? '',
        imageUri: p.image || null,
        priceCents: p.price ? Number(p.price) : null,
        level: 'envie',
        source: p.source ?? (p.url ? 'lien' : null),
      }}
      onSave={async (d) => {
        await mutate((db) => createWish(db, d));
      }}
    />
  );
}
