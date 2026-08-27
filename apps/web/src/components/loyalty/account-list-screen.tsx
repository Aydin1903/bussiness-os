'use client';

import type { Contact, LoyaltyAccount, LoyaltySummary } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton } from '@/components/module-kit/chrome';
import {
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
} from '@/components/module-kit/form-kit';
import {
  CardHeader,
  CardMeta,
  CardTitleLink,
  RecordCard,
} from '@/components/module-kit/record-card';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  DeskSkeleton,
  ROOM_RISE,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { listContacts } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { createLoyaltyAccount, getLoyaltySummary, listLoyaltyAccounts } from '@/lib/api/loyalty';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';

import { BalanceMark, UnresolvedContact } from './chrome';
import { LoyaltyWall } from './loyalty-wall';

export const PAGE_SIZE = 20;
const CONTACT_PAGE_SIZE = 100;

/**
 * Sadakat odasının tezgahı — hesap listesi (ADR-0051 §9).
 *
 * ⚠️ FİLTRE YOKTUR ve bu bir eksiklik değil bir sonuçtur: bu modülde
 * filtrelenecek bir DURUM alanı yoktur (hesabın `status`u yok, §1.2). Kampanya
 * bir durum filtresi taşıyordu çünkü orada `draft`/`active`/`done` vardı.
 * Boş bir filtre şeridi koymak, olmayan bir eksen VAR gibi gösterirdi.
 */
export function LoyaltyAccountListScreen() {
  const role = useCurrentRole();
  const canWrite = !isReadOnly(role);

  const [items, setItems] = useState<readonly LoyaltyAccount[]>([]);
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listLoyaltyAccounts({ limit: PAGE_SIZE, offset });
      setItems(page.items);
      setTotal(page.total);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [offset]);

  /**
   * ⚠️ DUVAR VE LİSTE AYRI İSTEKLERDİR (ADR-0045'ten beri aynı sınır).
   *
   * Bir kayıt eklendiğinde ikisi de tazelenir; ama BAŞKA BİR KULLANICI aynı
   * anda puan yazarsa duvar bir sonraki tazelemeye kadar eskidir — canlı
   * güncelleme YOKTUR.
   */
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await getLoyaltySummary());
    } catch {
      /*
        ⚠️ ÖZET HATASI SESSİZDİR ve bu bilinçlidir: duvar iskelet olarak kalır,
        LİSTE ÇALIŞMAYA DEVAM EDER. Çalışan bir listeyi bir toplama sorgusu
        yüzünden gizlemek daha kötüydü.
      */
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const refresh = useCallback(async () => {
    await Promise.all([load(), loadSummary()]);
  }, [load, loadSummary]);

  return (
    <Room>
      <RoomTop name="Sadakat" />

      <RoomScroll>
        <LoyaltyWall summary={summary} loading={summaryLoading} />

        <Rise delay={ROOM_RISE.desk}>
          <Desk>
            <DeskHead
              title="Sadakat hesapları"
              right={
                canWrite ? (
                  <PillButton
                    onClick={() => {
                      setCreating((open) => !open);
                    }}
                  >
                    {creating ? 'Vazgeç' : 'Hesap aç'}
                  </PillButton>
                ) : undefined
              }
            />

            <DeskBody>
              {creating ? (
                <CreateAccountForm
                  onCancel={() => {
                    setCreating(false);
                  }}
                  onCreated={async () => {
                    setCreating(false);
                    setOffset(0);
                    await refresh();
                  }}
                />
              ) : null}

              {error === null ? null : <FormError message={error} />}

              {loading ? (
                <DeskSkeleton />
              ) : items.length === 0 ? (
                <EmptyState
                  title="Sadakat hesabı yok"
                  hint="Bir müşteriye hesap açın; sonra kasada puan kazandırabilir ve kullandırabilirsiniz."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((account) => (
                    <li key={account.id}>
                      <AccountCard account={account} />
                    </li>
                  ))}
                </ul>
              )}

              <Pager
                offset={offset}
                count={items.length}
                total={total}
                loading={loading}
                onPrevious={() => {
                  setOffset((value) => Math.max(0, value - PAGE_SIZE));
                }}
                onNext={() => {
                  setOffset((value) => value + PAGE_SIZE);
                }}
              />
            </DeskBody>
          </Desk>
        </Rise>
      </RoomScroll>
    </Room>
  );
}

function AccountCard({ account }: { readonly account: LoyaltyAccount }) {
  const last =
    account.lastEntryAt === null
      ? 'hareket yok'
      : `son hareket ${new Date(account.lastEntryAt).toLocaleDateString('tr-TR')}`;

  return (
    <RecordCard>
      <CardHeader>
        {/*
          ⚠️ AD ÇÖZÜLEMEZSE BAŞLIK YERİNE İŞARET — ama satır DÜŞMEZ (§9.2).
          Düşseydi bakiye görünmez olurdu ve duvarın toplamı listeyle TUTMAZDI.
        */}
        {account.contactName === null ? (
          <CardTitleLink href={`/app/loyalty/${account.id}`}>
            <UnresolvedContact />
          </CardTitleLink>
        ) : (
          <CardTitleLink href={`/app/loyalty/${account.id}`}>{account.contactName}</CardTitleLink>
        )}
        <BalanceMark balance={account.balance} />
      </CardHeader>
      <CardMeta items={[`${String(account.entryCount)} hareket`, last]} />
    </RecordCard>
  );
}

/**
 * Hesap açma — ⚠️ MÜŞTERİ SEÇİLMEDEN AÇILAMAZ (ADR-0051 §6.1).
 *
 * ============================================================================
 * ⚠️ BU FORMDA SERBEST BİR "MÜŞTERİ ADI" ALANI YOKTUR VE OLMAYACAKTIR
 * ============================================================================
 * `crmContactId` ZORUNLUDUR — projede ilk zorunlu cross-modül işaretçisi. Bir
 * ad alanı koymak, müşteri kimliğinin İKİNCİ BİR DOĞRULUK KAYNAĞINI açardı
 * (§6.1'de değerlendirildi ve reddedildi).
 *
 * ⚠️ Beş modülde "zorunluluk sahte kayıt üretir" dersi burada TERS İŞLER: bir
 * işletme puan verdiği kişiyi ZATEN tanımak zorundadır — yoksa müşteri geri
 * geldiğinde puanını bulamaz. Yani kişiyi önce CRM'e kaydetmek uydurma veri
 * değil, GERÇEK müşteri kaydı üretir.
 */
function CreateAccountForm({
  onCancel,
  onCreated,
}: {
  readonly onCancel: () => void;
  readonly onCreated: () => Promise<void>;
}) {
  const [contacts, setContacts] = useState<readonly Contact[]>([]);
  const [contactId, setContactId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactsLoading, setContactsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listContacts({ limit: CONTACT_PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (active) {
          setContacts(page.items);
        }
      })
      .catch(() => {
        if (active) {
          setError('Müşteri listesi alınamadı.');
        }
      })
      .finally(() => {
        if (active) {
          setContactsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await createLoyaltyAccount({ crmContactId: contactId });
      await onCreated();
    } catch (cause) {
      /*
        ⚠️ 409 BURADA GERÇEK BİR CEVAPTIR ve mesajı MEVCUT HESABIN ID'SİNİ
        taşır (ADR-0051 §1.2). Kampanya ve Geri Bildirim'de 409 diye bir cevap
        YOKTU; burada var çünkü aynı müşteriye ikinci bir hesap BAKİYEYİ İKİYE
        BÖLER ve hata SESSİZ olurdu.
      */
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InlinePanel title="Sadakat hesabı aç">
      <SelectField
        id="loyalty-contact"
        label="Müşteri"
        value={contactId}
        onChange={setContactId}
        options={[
          {
            value: '',
            label: contactsLoading ? 'Yükleniyor…' : 'Müşteri seçin',
          },
          ...contacts.map((contact) => ({ value: contact.id, label: contact.fullName })),
        ]}
      />

      {/*
        ⚠️ LİSTE İLK 100 KİŞİYLE SINIRLIDIR ve bu AÇIKÇA söylenir. Sessizce
        kırpmak, kişisini bulamayan kullanıcıya "bu kişi yok" dedirtirdi
        (İK'nın izin kuyruğundaki aynı sınır, ikinci kez).
      */}
      <p className="mt-1.5 text-[11px] text-fg-2">
        Listede ilk {CONTACT_PAGE_SIZE} müşteri görünür. Aradığınız kişi yoksa önce Müşteriler
        odasından ekleyin — sadakat hesabı bir müşteriye bağlı olmak zorundadır.
      </p>

      {error === null ? null : <FormError message={error} />}

      <FormActions>
        <GhostButton onClick={onCancel}>Vazgeç</GhostButton>
        <PillButton onClick={() => void submit()} disabled={saving || contactId === ''}>
          {saving ? 'Açılıyor…' : 'Hesabı aç'}
        </PillButton>
      </FormActions>
    </InlinePanel>
  );
}
