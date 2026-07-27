/**
 * `/app` — F1'de boş dashboard İSKELETİ.
 *
 * Gerçek içerik (modül kartları, AI özetleri) sonraki fazlarda gelir. Şimdilik
 * yalnızca app kabuğunun (`app/layout.tsx`) render olduğunu gösterir.
 */
export default function AppHomePage() {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold">Panel</h1>
      <p className="text-sm text-fg-muted">İçerik sonraki fazda eklenecek.</p>
    </div>
  );
}
