/**
 * Form geneli hata kutusu — RFC 7807 mesajını (ApiError'dan) gösterir.
 *
 * `message` boşsa hiçbir şey render etmez. Rol `alert`: ekran okuyucular
 * hatayı anında duyurur (erişilebilirlik).
 */
export function FormError({ message }: { message: string | null }) {
  if (message === null || message === '') {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
    >
      {message}
    </p>
  );
}
