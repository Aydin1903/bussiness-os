'use client';

import type { MembershipRoleName } from '@business-os/contracts';
import { useEffect, useState } from 'react';

import { listMyMemberships } from '@/lib/api/tenants';
import { useSession } from './session-provider';

/**
 * Rol henüz bilinmiyor ya da öğrenilemedi. `viewer` ile AYNI ŞEY DEĞİLDİR.
 *
 * Ayrım `isReadOnly`'de karşılığını bulur: bilinmeyen rol yazma yüzeylerini
 * GİZLEMEZ (aşağıdaki fail-open gerekçesi).
 */
export type RoleState = MembershipRoleName | 'unknown';

/**
 * Kullanıcının AKTİF tenant'taki rolü.
 *
 * ============================================================================
 * NEDEN `/me/memberships`
 * ============================================================================
 * Rol istemcide başka bir yerde durmuyor: access token gövdesi çözülmüyor
 * (ve çözülmemeli — imza doğrulaması istemcinin işi değil), oturum store'u
 * yalnızca token ve `currentTenantId` taşıyor. `/me/memberships` rolü zaten
 * dönüyor ve `CompanySwitcher` de aynı ucu aynı biçimde çağırıyor.
 *
 * Modül düzeyinde ÖNBELLEK YOK — bilinçli. Önbellek, çıkış yapıp başka bir
 * kullanıcıyla girildiğinde (sayfa yenilenmeden) eski rolü taşırdı ve
 * geçersiz kılma kuralı yazmak, kazandığı tek GET'ten daha fazla riske mal
 * olurdu. `CompanySwitcher` de aynı sebeple her mount'ta çekiyor.
 *
 * ============================================================================
 * ⚠️ BU BİR GÜVENLİK SINIRI DEĞİLDİR
 * ============================================================================
 * `middleware.ts` için yazılan cümlenin aynısı geçerli (FRONTEND_ARCHITECTURE
 * §3.2): gerçek yetki API'de, `PermissionGuard`'da verilir (ADR-0025). Buradaki
 * tek amaç, kullanıcıya çalışmayacağı bir düğmeyi göstermemek.
 *
 * Bunun doğrudan sonucu FAIL-OPEN olmaktır: rol öğrenilemezse yüzeyler
 * ÇİZİLİR. Ters yön (bilinmiyorsa gizle), geçici bir ağ hatasında bir owner'ı
 * kendi CRM'inde salt okur bırakırdı — hiçbir güvenlik kazancı olmadan, çünkü
 * sunucu zaten reddediyor.
 */
export function useCurrentRole(): RoleState {
  const { currentTenantId } = useSession();
  const [role, setRole] = useState<RoleState>('unknown');

  useEffect(() => {
    if (currentTenantId === undefined) {
      return;
    }

    let active = true;

    listMyMemberships()
      .then((response) => {
        if (!active) {
          return;
        }
        const membership = response.items.find((item) => item.tenantId === currentTenantId);
        setRole(membership?.role ?? 'unknown');
      })
      .catch(() => {
        // Sessiz: rol öğrenilemedi, yüzeyler çizilmeye devam eder ve sunucu
        // yetkisiz isteği 403 ile keser. Kullanıcıya gösterilecek bir şey yok.
        if (active) {
          setRole('unknown');
        }
      });

    return () => {
      active = false;
    };
  }, [currentTenantId]);

  return role;
}

/**
 * CRM'in kaba yazma kuralı (Product Owner kararı, 2026-08-07).
 *
 * `viewer` CRM'in DÖRT kaynağında da salt okurdur — `crm.permissions.ts`'teki
 * katalog bunu dördünde de aynı biçimde söylüyor. Bu yüzden istemcide tek bir
 * satır yeter; ADR-0025'in `resource:action` kataloğunu kopyalamak, ikinci bir
 * doğruluk kaynağı yaratırdı ve rol tanımı sunucuda değişince sessizce
 * ayrışırdı.
 *
 * `unknown` salt okur SAYILMAZ — yukarıdaki fail-open gerekçesi.
 */
export function isReadOnly(role: RoleState): boolean {
  return role === 'viewer';
}
