import { useSyncExternalStore } from 'react';
import {
  getConsent,
  getConsentRecord,
  precisaDecidir,
  subscribeConsent,
  type ConsentCategories,
} from '../lib/cookieConsent';

/** Estado reativo do consentimento de cookies. Re-renderiza quando o usuário
 *  decide no banner ou troca a escolha nas configurações. */
export function useConsent(): {
  categorias: ConsentCategories;
  precisaDecidir: boolean;
  decididoEm: string | null;
} {
  const record = useSyncExternalStore(
    subscribeConsent,
    getConsentRecord,
    () => null,
  );
  return {
    categorias: record ? record.categorias : getConsent(),
    precisaDecidir: precisaDecidir(),
    decididoEm: record ? record.ts : null,
  };
}
