'use client';

import type { Campaign, CampaignSummary } from '@business-os/contracts';
import {
  MAX_CAMPAIGN_CHANNEL_CHARS,
  MAX_CAMPAIGN_NAME_CHARS,
  MAX_CAMPAIGN_RESULT_NOTE_CHARS,
} from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextAreaField,
  TextField,
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
import { createCampaign, getCampaignSummary, listCampaigns } from '@/lib/api/marketing';
import { errorMessage } from '@/lib/api/error-message';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';

import { Channel, DateRange, GapMark, StatusBadge, toCampaignStatus } from './chrome';
import { MarketingWall } from './marketing-wall';

export const PAGE_SIZE = 20;

const STATUS_FILTERS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Hepsi' },
  { value: 'draft', label: 'Taslak' },
  { value: 'active', label: 'Yayında' },
  { value: 'done', label: 'Bitti' },
];

/**
 * Kampanya odasının tezgahı — liste (ADR-0047 §9).
 *
 * ⚠️ SONUÇ NOTU BURADA DÜZENLENMEZ, DETAYDA DÜZENLENİR. Liste bir okuma
 * yüzeyidir; sonuç notu 1250 karaktere kadar çıkabilir ve bir liste satırında
 * yazılamaz. Kart, detaya GİDEN bir bağ taşır.
 */
export function CampaignListScreen() {
  const role = useCurrentRole();
  const canWrite = !isReadOnly(role);

  const [items, setItems] = useState<readonly Campaign[]>([]);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const narrowed = toCampaignStatus(status);
    try {
      const page = await listCampaigns({
        limit: PAGE_SIZE,
        offset,
        ...(narrowed === null ? {} : { status: narrowed }),
      });
      setItems(page.items);
      setTotal(page.total);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [offset, status]);

  /**
   * ⚠️ DUVAR VE LİSTE AYRI İSTEKLERDİR (ADR-0045'in kaydettiği aynı sınır).
   *
   * Bir kayıt eklendiğinde ikisi de tazelenir; ama BAŞKA BİR KULLANICI aynı
   * anda kayıt girerse duvar bir sonraki tazelemeye kadar eskidir — canlı
   * güncelleme YOKTUR.
   */
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      setSummary(await getCampaignSummary());
    } catch {
      /*
        ⚠️ ÖZET HATASI SESSİZDİR ve bu bilinçlidir: duvar iskelet olarak kalır,
        LİSTE ÇALIŞMAYA DEVAM EDER. Çalışan bir listeyi bir toplama sorgusu
        yüzünden gizlemek daha kötüydü. Bedeli: "sayılar neden görünmüyor"
        sorusu cevapsız kalabilir.
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
      <RoomTop name="Kampanyalar" />

      <RoomScroll>
        <MarketingWall summary={summary} loading={summaryLoading} />

        <Rise delay={ROOM_RISE.desk}>
          <Desk>
            <DeskHead
              title="Kampanyalar"
              right={
                canWrite ? (
                  <PillButton
                    onClick={() => {
                      setCreating((open) => !open);
                    }}
                  >
                    {creating ? 'Vazgeç' : 'Kampanya ekle'}
                  </PillButton>
                ) : undefined
              }
            />

            <DeskBody>
              {creating ? (
                <CreateCampaignForm
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

              <div className="mb-3 max-w-[220px]">
                <SelectField
                  id="campaign-status-filter"
                  label="Durum"
                  value={status}
                  onChange={(next) => {
                    setOffset(0);
                    setStatus(next);
                  }}
                  options={STATUS_FILTERS}
                />
              </div>

              {error === null ? null : <FormError message={error} />}

              {loading ? (
                <DeskSkeleton />
              ) : items.length === 0 ? (
                <EmptyState
                  title="Kampanya yok"
                  hint={
                    status === ''
                      ? 'Bir kampanya kaydedin; bittiğinde sonuç notunu yazarsanız asistan onu hatırlar.'
                      : 'Bu durumda kampanya yok. Filtreyi değiştirin.'
                  }
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((campaign) => (
                    <li key={campaign.id}>
                      <CampaignCard campaign={campaign} />
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

/**
 * Kampanya kartı.
 *
 * ⚠️ BOŞLUK GÖSTERGESİ BURADA GÖRÜNÜR (`GapMark`) — `campaign-gap`
 * katkıcısının arayüz karşılığı. Kart bir HATA tonu taşımaz: sonucu
 * yazılmamış bir kampanya bozuk değil, TAMAMLANMAMIŞTIR.
 */
function CampaignCard({ campaign }: { readonly campaign: Campaign }) {
  return (
    <RecordCard>
      <CardHeader>
        <CardTitleLink href={`/app/marketing/${campaign.id}`}>{campaign.name}</CardTitleLink>
        <div className="flex flex-wrap items-center gap-1.5">
          <GapMark campaign={campaign} />
          <StatusBadge value={campaign.status} />
        </div>
      </CardHeader>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <DateRange startsOn={campaign.startsOn} endsOn={campaign.endsOn} />
        <Channel value={campaign.channel} />
      </div>

      <CardMeta items={[campaign.companyName]} />

      {campaign.resultNote === null ? null : (
        <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.65] text-fg-2">
          {campaign.resultNote}
        </p>
      )}
    </RecordCard>
  );
}

/**
 * Yeni kampanya formu.
 *
 * ⚠️ `status` VARSAYILANI `draft` ama SEÇİLEBİLİR — ve `done` de seçilebilir.
 * Bitmiş bir kampanyayı geriye dönük kaydetmek GERÇEK BİR İHTİYAÇTIR
 * (ADR-0047 §2.2: durum geçiş kuralı YOKTUR).
 */
function CreateCampaignForm({
  onCancel,
  onCreated,
}: {
  readonly onCancel: () => void;
  readonly onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('');
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [resultNote, setResultNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await createCampaign({
        name,
        channel: channel === '' ? null : channel,
        startsOn,
        endsOn: endsOn === '' ? null : endsOn,
        ...(toCampaignStatus(status) === null
          ? {}
          : { status: toCampaignStatus(status) ?? 'draft' }),
        resultNote: resultNote === '' ? null : resultNote,
      });
      await onCreated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlinePanel title="Yeni kampanya">
      <FieldGrid>
        <TextField
          id="campaign-name"
          label="Kampanya adı"
          value={name}
          onChange={setName}
          required
          disabled={saving}
          hint={`En fazla ${String(MAX_CAMPAIGN_NAME_CHARS)} karakter`}
        />
        <TextField
          id="campaign-channel"
          label="Kanal"
          value={channel}
          onChange={setChannel}
          disabled={saving}
          placeholder="Instagram, e-posta, fuar…"
          hint={`Serbest metin — en fazla ${String(MAX_CAMPAIGN_CHANNEL_CHARS)} karakter`}
        />
        <TextField
          id="campaign-starts"
          label="Başlangıç"
          value={startsOn}
          onChange={setStartsOn}
          type="date"
          required
          disabled={saving}
        />
        <TextField
          id="campaign-ends"
          label="Bitiş"
          value={endsOn}
          onChange={setEndsOn}
          type="date"
          disabled={saving}
          /* ⚠️ Boş bırakmak bir EKSİK DEĞİL, "süresiz"dir (§1.5). */
          hint="Boş bırakılırsa süresiz sayılır"
        />
        <SelectField
          id="campaign-status"
          label="Durum"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS.filter((option) => option.value !== '')}
        />
      </FieldGrid>

      <TextAreaField
        id="campaign-result"
        label="Sonuç notu"
        value={resultNote}
        onChange={setResultNote}
        disabled={saving}
        rows={3}
        hint={`İsteğe bağlı — en fazla ${String(MAX_CAMPAIGN_RESULT_NOTE_CHARS)} karakter. Yazarsanız asistanın aramasına girer.`}
      />

      {error === null ? null : <FormError message={error} />}

      <FormActions>
        <GhostButton onClick={onCancel} disabled={saving}>
          Vazgeç
        </GhostButton>
        <PillButton onClick={() => void submit()} disabled={saving || name.trim() === ''}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </PillButton>
      </FormActions>
    </InlinePanel>
  );
}

/** ⚠️ Yerel gün — `toISOString()` UTC'ye çevirir ve bir gün kaydırabilir. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${date}`;
}
