import { useEffect, useState } from 'react';

import { nowStamp } from '@/lib/dates';

/** L'instant présent ('YYYY-MM-DDTHH:mm'), rafraîchi chaque minute. */
export function useNow() {
  const [now, setNow] = useState(nowStamp);
  useEffect(() => {
    const tick = () => setNow(nowStamp());
    const ms = 60_000 - (Date.now() % 60_000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, ms);
    return () => {
      clearTimeout(first);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}
