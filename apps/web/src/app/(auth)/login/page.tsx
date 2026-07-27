/**
 * `/login` — F1'de yalnızca İSKELET.
 *
 * Bu sayfanın var olma sebebi, middleware'in kimliksiz kullanıcıyı buraya
 * yönlendirebilmesidir (§3.2). Gerçek giriş formu F2'de gelir; şimdilik yalnızca
 * kart düzeninin (`(auth)/layout.tsx`) yerinde durduğunu gösterir.
 */
export default function LoginPage() {
  return (
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-base font-medium">Giriş</h1>
      <p className="text-sm text-fg-muted">Giriş formu bir sonraki fazda (F2) eklenecek.</p>
    </div>
  );
}
