import type { Metadata } from 'next';

import { accentStyle } from '@/components/landing/accent-style';
import { Corridor } from '@/components/landing/corridor';
import { LANDING_MODULES, moduleNo } from '@/components/landing/modules';
import { RoomHeader } from '@/components/landing/room-header';

export const metadata: Metadata = {
  title: 'Modüller',
  description: 'On iki oda, tek hafıza. Her modülün asistana kazandırdığı bağlam.',
};

/**
 * `/moduller` — on iki modülün tam listesi (ADR-0054).
 *
 * ⚠️ Liste `LANDING_MODULES`ten TÜRETİLİR ve o dosyanın renkleri bir testle
 * `module-colors.css`e bağlıdır. Elle yazılsaydı bir modülün rengi değiştiği
 * gün uygulama yeni rengi, pazarlama sayfası eskisini gösterirdi ve hata
 * SESSİZ olurdu.
 */
export default function ModulesPage() {
  return (
    <>
      <RoomHeader renk="#3173af" etiket="ODA 02 · MODÜLLER" baslik="On iki oda, tek hafıza.">
        Hepsi ilk günden açık. Bir modülü kullanmasanız da diğerleri çalışır; kullandığınız her
        modül asistanın bildiği alanı genişletir.
      </RoomHeader>

      <section className="kap">
        <div className="bolum-bas bolum-bas-sik">
          <span className="etiket">TAM LİSTE</span>
          <h2 className="d2">Her kapı bir soru</h2>
          <p className="alt">Sağdaki satır, o modülün asistana kazandırdığı hafızayı söyler.</p>
        </div>

        <div className="satirlar gir">
          {LANDING_MODULES.map((modul, index) => (
            <div className="satir" key={modul.key} style={accentStyle(modul.renk)}>
              <span className="no">{moduleNo(index)}</span>
              <h3>
                <span className="nokta" />
                {modul.ad}
              </h3>
              <div>
                <p className="soru">{modul.soru}</p>
                <p className="kucuk aciklama">{modul.icerik}</p>
              </div>
              <span className="rol">{modul.rol}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">TEK SORU · ON SEKİZ KAYNAK</span>
          <h2 className="d2">On iki oda aynı anda konuşur</h2>
          <p className="alt">
            Bir soru sorduğunuzda on sekiz ayrı hafıza kaynağı aynı anda taranır; en alakalı olanlar
            cevaba girer ve <b>hangi kaynaktan geldiği yazılır</b>. Hiçbir modül diğerinin verisine
            dokunmaz — birleşme yalnızca cevap anında olur.
          </p>
        </div>

        <div className="sahneler sahneler-tek gir">
          <div className="sahne sahne-genis">
            <img
              src="/brand/mascot-scene-stage.webp"
              alt="Veri grafiklerinin arasında duran KobiWise asistanı"
              loading="lazy"
              decoding="async"
              width={1254}
              height={1254}
              style={{ objectPosition: '50% 46%' }}
            />
          </div>
        </div>
      </section>

      <Corridor haric="moduller" />
    </>
  );
}
