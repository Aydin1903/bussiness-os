'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/error-message';
import { createTenant } from '@/lib/api/tenants';
import { selectTenant } from '@/lib/session/select-tenant';

/** Ada göre slug önerisi: küçük harf, harf-rakam-tire, tekrarlı tireleri sadeleştir. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * `/create-tenant` — yeni şirket (tenant) oluşturma.
 *
 * Login sonrası hiç üyeliği olmayan kullanıcı buraya yönlenir (ADR-0028).
 * Başarıda tenant V1'de `active` döner (ADR-0016 senkron provisioning) →
 * hemen switch-tenant + `/app`.
 */
export default function CreateTenantPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const tenant = await createTenant({ name, slug });
      // V1: tenant `active` döndü → doğrudan seç ve içeri gir.
      await selectTenant(tenant.id);
      router.push('/app');
    } catch (caught) {
      setError(
        errorMessage(caught, 'Şirket oluşturulamadı.', {
          409: 'Bu slug zaten kullanımda. Farklı bir tane deneyin.',
        }),
      );
      setLoading(false);
    }
  }

  return (
    <AuthScreen screen="create-tenant">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Şirketini oluştur</h1>
          <p className="text-sm text-fg-muted">Başlamak için şirketine bir isim ve kısa ad ver.</p>
        </header>

        <FormError message={error} />

        <Field label="Şirket adı" htmlFor="name">
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              // Kullanıcı slug'ı elle değiştirmediyse addan otomatik türet.
              if (!slugEdited) {
                setSlug(slugify(value));
              }
            }}
            required
          />
        </Field>

        <Field label="Kısa ad (slug)" htmlFor="slug">
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
            placeholder="acme"
            required
          />
          <span className="text-xs text-fg-muted">
            Yalnızca küçük harf, rakam ve tire. Adresinde görünür.
          </span>
        </Field>

        <Button type="submit" loading={loading}>
          Şirketi oluştur
        </Button>
      </form>
    </AuthScreen>
  );
}
