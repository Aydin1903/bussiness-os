'use client';

import type { Company, Contact, Interaction, OpportunityListRow } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { getCompany, listContacts, listInteractions, listOpportunities } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';

/** Bir şirketin kişi sayfası YOK: tek çağrıda çekilir, sınır aşılırsa söylenir. */
export const CONTACT_FETCH_LIMIT = 100;
/** Fırsatlar da aynı desende — tek şirketin fırsatı pratikte onlarla ölçülür. */
export const OPPORTUNITY_FETCH_LIMIT = 100;
export const INTERACTION_PAGE_SIZE = 20;

/**
 * Hangi çağrının düştüğü — TEK bir bayrak YETMEZ.
 *
 * `panel-screen.tsx › Failures` ile aynı gerekçe: kişiler geldiyse sayaç
 * GERÇEK bir ölçümdür ve görüşmeler düştü diye gizlenmemelidir. Tek bir
 * `degraded` bayrağı, çalışan yarıyı da cezalandırırdı.
 */
export interface DetailFailures {
  readonly contacts: boolean;
  readonly opportunities: boolean;
  readonly interactions: boolean;
}

export interface CompanyDetail {
  readonly company: Company | null;
  readonly contacts: readonly Contact[];
  readonly contactTotal: number;
  readonly opportunities: readonly OpportunityListRow[];
  readonly opportunityTotal: number;
  readonly interactions: readonly Interaction[];
  readonly interactionTotal: number;
}

const EMPTY: CompanyDetail = {
  company: null,
  contacts: [],
  contactTotal: 0,
  opportunities: [],
  opportunityTotal: 0,
  interactions: [],
  interactionTotal: 0,
};

/** Açılışta yapılan çağrılar — ad yalnızca `console.warn` için taşınır. */
const CALLS = ['GET /crm/contacts', 'GET /crm/opportunities', 'GET /crm/interactions'] as const;

/**
 * Şirket detayının üç kaynağı.
 *
 * ============================================================================
 * ŞİRKET AYRI, KALAN İKİSİ BİRLİKTE
 * ============================================================================
 * Şirket çağrısı ZORUNLUDUR: düşerse gösterilecek bir sayfa yoktur ve ekran
 * hata durumuna geçer. Kişiler ve görüşmeler ise TAMAMLAYICIDIR — biri
 * düşerse diğeri ve şirket kimliği yine çizilir (`Promise.allSettled`).
 *
 * `allSettled` reddi YUTAR; bu yüzden düşen çağrı hem log'a hem ekrana iz
 * bırakır. Sessiz kalınırsa "hiç görüşme yok" ile "görüşmeleri getiremedim"
 * aynı ekrana düşer ve kullanıcı var olan hafızasını KAYBOLMUŞ sanır — Panel'de
 * bir kez yaşanmış ve orada da böyle çözülmüş bir hata.
 */
export function useCompanyDetail(companyId: string, interactionOffset: number) {
  const [detail, setDetail] = useState<CompanyDetail>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [failures, setFailures] = useState<DetailFailures>({
    contacts: false,
    opportunities: false,
    interactions: false,
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const load = async (): Promise<void> => {
      let company: Company;
      try {
        company = await getCompany(companyId);
      } catch (caught) {
        if (active) {
          setFatalError(
            errorMessage(caught, undefined, {
              404: 'Bu müşteri bulunamadı. Silinmiş olabilir.',
              403: 'Bu müşteriyi görüntüleme yetkiniz yok.',
            }),
          );
        }
        return;
      }

      const [contacts, opportunities, interactions] = await Promise.allSettled([
        listContacts({ limit: CONTACT_FETCH_LIMIT, offset: 0, companyId }),
        listOpportunities({ limit: OPPORTUNITY_FETCH_LIMIT, offset: 0, companyId }),
        listInteractions({
          limit: INTERACTION_PAGE_SIZE,
          offset: interactionOffset,
          companyId,
        }),
      ]);

      if (!active) {
        return;
      }

      for (const [index, result] of [contacts, opportunities, interactions].entries()) {
        if (result.status === 'rejected') {
          // Uç adı LOG'a yazılır, kullanıcıya DEĞİL: onun ilgilendiği şey
          // "kişilerim mi, görüşmelerim mi" — `GET /crm/contacts` değil.
          // eslint-disable-next-line no-console
          console.warn(
            `[CompanyDetail] Yüklenemedi: ${CALLS[index] ?? 'bilinmeyen çağrı'}.`,
            result.reason,
          );
        }
      }

      setFatalError(null);
      setFailures({
        contacts: contacts.status === 'rejected',
        opportunities: opportunities.status === 'rejected',
        interactions: interactions.status === 'rejected',
      });
      setDetail({
        company,
        contacts: contacts.status === 'fulfilled' ? contacts.value.items : [],
        contactTotal: contacts.status === 'fulfilled' ? contacts.value.total : 0,
        opportunities: opportunities.status === 'fulfilled' ? opportunities.value.items : [],
        opportunityTotal: opportunities.status === 'fulfilled' ? opportunities.value.total : 0,
        interactions: interactions.status === 'fulfilled' ? interactions.value.items : [],
        interactionTotal: interactions.status === 'fulfilled' ? interactions.value.total : 0,
      });
    };

    void load().finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [companyId, interactionOffset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { detail, loading, fatalError, failures, reload };
}

/**
 * Kişi id → ad haritası.
 *
 * Görüşme akışı yalnızca `contactId` taşır; adı gösterebilmek için ZATEN
 * çekilmiş olan kişi listesi kullanılır. Kişi başına ayrı bir istek atmak N+1
 * olurdu ve bu ekranda kişiler her hâlükârda çekiliyor.
 *
 * ⚠️ Bilinen sınır: kişi sayısı `CONTACT_FETCH_LIMIT`'i aşarsa haritada
 * olmayan bir `contactId` bulunabilir. O durumda `InteractionStream` kişi
 * satırını hiç çizmez — yanlış bir ad göstermez.
 */
export function contactNameMap(contacts: readonly Contact[]): ReadonlyMap<string, string> {
  return new Map(contacts.map((contact) => [contact.id, contact.fullName]));
}
