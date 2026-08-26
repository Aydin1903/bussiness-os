'use client';

import type { Campaign } from '@business-os/contracts';
import {
  MAX_CAMPAIGN_CHANNEL_CHARS,
  MAX_CAMPAIGN_NAME_CHARS,
  MAX_CAMPAIGN_RESULT_NOTE_CHARS,
} from '@business-os/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PillButton } from '@/components/module-kit/chrome';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
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
import { errorMessage } from '@/lib/api/error-message';
import { deleteCampaign, getCampaign, updateCampaign } from '@/lib/api/marketing';
import { canDeleteCampaign } from '@/lib/config/marketing';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';

import { GapMark, StatusBadge, toCampaignStatus } from './chrome';

const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'draft', label: 'Taslak' },
  { value: 'active', label: 'Yayında' },
  { value: 'done', label: 'Bitti' },
];

/**
 * Tek kampanya — DÜZENLENEBİLİR (ADR-0047 §2.2).
 *
 * ============================================================================
 * ⚠️ BU EKRANIN VAR OLMA SEBEBİ: SONUÇ NOTU KAMPANYA BİTTİKTEN SONRA YAZILIR
 * ============================================================================
 * Teklif/Fatura'da `draft` sonrası düzenleme KAPALIDIR ve orada bir "kilitli"
 * uyarısı vardır. ⚠️ **Burada öyle bir uyarı YOKTUR ve olmamalıdır** — ikisi
 * karıştırılmamalıdır:
 *
 *   gönderilmiş belge -> ŞİRKETTEN ÇIKTI, bir SNAPSHOT'tır  -> kilitli
 *   bitmiş kampanya   -> kendi notumuz, sonuç SONRA yazılır -> AÇIK
 *
 * ⚠️ Kilit olsaydı kullanıcı kampanyayı yapay olarak `active` tutardı, yani
 * DURUM YALAN SÖYLERDİ (ADR-0033'ün "sahte Genel projesi" dersinin en net
 * şekli).
 *
 * ⚠️ DETAY SAYFASININ DUVARI YOKTUR (ADR-0038): özetlenecek bir durum değil,
 * tek bir kayıt var.
 */
export function CampaignDetailScreen({ campaignId }: { readonly campaignId: string }) {
  const router = useRouter();
  const role = useCurrentRole();
  const canWrite = !isReadOnly(role);
  const mayDelete = canDeleteCampaign(role);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCampaign(await getCampaign(campaignId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Room>
      <RoomTop name="Kampanya" meta={campaign?.name} />

      <RoomScroll>
        <Rise delay={ROOM_RISE.desk}>
          <Desk>
            <DeskHead
              title="Kampanya"
              right={
                campaign === null ? undefined : (
                  <div className="flex items-center gap-1.5">
                    <GapMark campaign={campaign} />
                    <StatusBadge value={campaign.status} />
                  </div>
                )
              }
            />

            <DeskBody>
              {error === null ? null : <FormError message={error} />}

              {loading ? (
                <DeskSkeleton rows={4} />
              ) : campaign === null ? null : (
                <CampaignForm
                  campaign={campaign}
                  editable={canWrite}
                  mayDelete={mayDelete}
                  onSaved={(next) => {
                    setCampaign(next);
                  }}
                  onDeleted={() => {
                    router.push('/app/marketing');
                  }}
                />
              )}
            </DeskBody>
          </Desk>
        </Rise>
      </RoomScroll>
    </Room>
  );
}

function CampaignForm({
  campaign,
  editable,
  mayDelete,
  onSaved,
  onDeleted,
}: {
  readonly campaign: Campaign;
  readonly editable: boolean;
  readonly mayDelete: boolean;
  readonly onSaved: (next: Campaign) => void;
  readonly onDeleted: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [channel, setChannel] = useState(campaign.channel ?? '');
  const [startsOn, setStartsOn] = useState(campaign.startsOn);
  const [endsOn, setEndsOn] = useState(campaign.endsOn ?? '');
  const [status, setStatus] = useState<string>(campaign.status);
  const [resultNote, setResultNote] = useState(campaign.resultNote ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateCampaign(campaign.id, {
        name,
        channel: channel === '' ? null : channel,
        startsOn,
        endsOn: endsOn === '' ? null : endsOn,
        ...(toCampaignStatus(status) === null
          ? {}
          : { status: toCampaignStatus(status) ?? 'draft' }),
        resultNote: resultNote === '' ? null : resultNote,
      });
      onSaved(next);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldGrid>
        <TextField
          id="detail-name"
          label="Kampanya adı"
          value={name}
          onChange={setName}
          disabled={!editable || saving}
          hint={`En fazla ${String(MAX_CAMPAIGN_NAME_CHARS)} karakter`}
        />
        <TextField
          id="detail-channel"
          label="Kanal"
          value={channel}
          onChange={setChannel}
          disabled={!editable || saving}
          hint={`Serbest metin — en fazla ${String(MAX_CAMPAIGN_CHANNEL_CHARS)} karakter`}
        />
        <TextField
          id="detail-starts"
          label="Başlangıç"
          value={startsOn}
          onChange={setStartsOn}
          type="date"
          disabled={!editable || saving}
        />
        <TextField
          id="detail-ends"
          label="Bitiş"
          value={endsOn}
          onChange={setEndsOn}
          type="date"
          disabled={!editable || saving}
          hint="Boş bırakılırsa süresiz sayılır"
        />
        {/*
          ⚠️ DURUM HER YÖNE DEĞİŞTİRİLEBİLİR — `done`dan `active`e de.
          Durum geçiş kuralı YOKTUR (§2.2): bir kampanyayı yanlışlıkla
          kapatmak geri alınabilir olmalıdır.
        */}
        <SelectField
          id="detail-status"
          label="Durum"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS}
        />
      </FieldGrid>

      {/*
        ⚠️ ASIL ALAN BURASI — VE `done` İKEN DE AÇIKTIR.
        Ekranın tek en önemli davranışı bu: `disabled` YALNIZCA role bakar,
        duruma DEĞİL.
      */}
      <TextAreaField
        id="detail-result"
        label="Sonuç notu"
        value={resultNote}
        onChange={setResultNote}
        disabled={!editable || saving}
        rows={5}
        hint={
          campaign.status === 'done' && campaign.resultNote === null
            ? 'Bu kampanya bitti ama sonucu yazılmadı — yazarsanız asistanın aramasına girer.'
            : `En fazla ${String(MAX_CAMPAIGN_RESULT_NOTE_CHARS)} karakter. Yazarsanız asistanın aramasına girer.`
        }
      />

      {error === null ? null : <FormError message={error} />}

      {saved ? (
        <p className="text-[12px] text-fg-2" role="status">
          Kaydedildi.
        </p>
      ) : null}

      {editable ? (
        <FormActions>
          {mayDelete ? (
            <ConfirmDelete
              question="Kampanyayı silmek istediğinize emin misiniz?"
              confirmLabel="Kalıcı olarak sil"
              /*
                ⚠️ İptal edilen bir kampanyanın TEK yolu budur — `cancelled`
                diye bir durum YOKTUR (§1.6): iptal edilen kampanya YAPILMAMIŞ
                kampanyadır.
              */
              ariaLabel="Kampanyayı sil"
              onConfirm={() => {
                void deleteCampaign(campaign.id).then(onDeleted);
              }}
            />
          ) : (
            <GhostButton onClick={() => undefined} disabled>
              Silme yetkiniz yok
            </GhostButton>
          )}
          <PillButton onClick={() => void submit()} disabled={saving || name.trim() === ''}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </PillButton>
        </FormActions>
      ) : (
        <p className="text-[12px] text-fg-3">Bu kaydı düzenlemek için yetkiniz yok.</p>
      )}
    </div>
  );
}
