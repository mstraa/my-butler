import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { parseDay } from '@/lib/dates';

/** '2026-09' → 'Septembre'. */
export function monthLabel(m: string) {
  const s = format(parseDay(`${m}-01`), 'MMMM', { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
