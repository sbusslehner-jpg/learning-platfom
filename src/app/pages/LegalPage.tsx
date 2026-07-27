import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";
import { FELDNAMEN, offeneAngaben, RECHTSTRAEGER as R } from "../legal/entity";
import { EMPFAENGER, FRISTEN, MASSNAHMEN } from "../legal/processing";

// ─── Rechtsseiten ─────────────────────────────────────────────────────────────
//
// Die Texte beschreiben die TATSÄCHLICHEN Datenflüsse: Empfänger, Regionen,
// Speicherfristen und Schutzmaßnahmen stammen aus `../legal/processing.ts` und
// sind dort mit ihrer Quelle im Betrieb belegt. Die Angaben zum Unternehmen
// stehen in `../legal/entity.ts` – einmal ausfüllen, beide Seiten vollständig.
//
// Was diese Texte NICHT sind: juristisch freigegeben. Die Bewertung – vor allem
// die Rechtsgrundlage für die Auswertung von Lernfortschritt im
// Beschäftigungsverhältnis – gehört zum Datenschutzbeauftragten und zum
// Betriebsrat, nicht in den Quellcode.
//
// `VITE_LEGAL_REVIEWED=true` blendet den Hinweisbalken aus. Das ist bewusst
// eine ausdrückliche Handlung: Wer ihn entfernt, bestätigt die Prüfung.
// Fehlende Pflichtangaben bleiben trotzdem sichtbar – ein Impressum mit Lücken
// stillschweigend zu veröffentlichen wäre die schlechtere Voreinstellung.

const REVIEWED = import.meta.env.VITE_LEGAL_REVIEWED === "true";

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F8FA] flex flex-col">
      <div className="max-w-[760px] w-full mx-auto px-6 py-10 flex-1">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-[13px] text-[#007D78] hover:underline mb-6">
          <ChevronLeft size={15} /> Zurück zur Anmeldung
        </Link>
        <h1 className="text-[28px] font-semibold text-[#232830] mb-6">{title}</h1>
        <div className="bg-white rounded-xl border border-[#C3C9D1] p-6 lg:p-8 text-[15px] text-[#3A424E] leading-relaxed shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Hinweis auf den Entwurfsstand und – immer – auf noch fehlende Pflichtangaben. */
function ReviewNote() {
  const offen = offeneAngaben();

  if (REVIEWED && offen.length === 0) return null;

  if (REVIEWED) {
    return (
      <div className="rounded-lg bg-[#FDEEEC] border border-[#F3C9C3] px-4 py-3 text-[13px] text-[#B42318] mb-6">
        <strong className="block mb-1">
          {offen.length} Pflichtangabe(n) fehlen trotz erteilter Freigabe
        </strong>
        Ohne diese Angaben ist die Seite nach § 5 ECG unvollständig:{" "}
        {offen.join(", ")}. Nachzutragen in <code>src/app/legal/entity.ts</code>.
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[#FDF3E4] border border-[#F5E3C6] px-4 py-3 text-[13px] text-[#B45309] mb-6">
      <strong className="block mb-1">Entwurf – juristisch noch nicht freigegeben</strong>
      <p className="mb-2">
        Der Text beschreibt die tatsächlichen Datenflüsse der Plattform, ist aber
        weder anwaltlich noch vom Datenschutzbeauftragten geprüft. Vor einem
        Rollout mit echten Personendaten ist die Prüfung nachzuholen.
      </p>
      {offen.length > 0 && (
        <p>
          <strong>Noch offen ({offen.length}):</strong> {offen.join(", ")} — einzutragen
          in <code>src/app/legal/entity.ts</code>.
        </p>
      )}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-semibold text-[#232830] mt-7 mb-2 first:mt-0">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-semibold text-[#232830] mt-5 mb-1.5">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3">{children}</p>;
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-1.5 mb-3">{children}</ul>;
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="text-[#007D78] hover:underline" href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

/**
 * Ein Feld aus den Unternehmensangaben.
 * Ist es leer, erscheint statt eines stillen Lochs ein benannter Platzhalter.
 */
function F({ k }: { k: keyof typeof R }) {
  const value = String(R[k] ?? "").trim();
  if (value) return <>{value}</>;
  return (
    <span className="bg-[#FDF3E4] text-[#B45309] px-1 rounded">[{FELDNAMEN[k]}]</span>
  );
}

/** Anschrift aus mehreren Feldern – ohne leere Zeilen bei Teilangaben. */
function Anschrift() {
  return (
    <>
      <F k="firma" /><br />
      <F k="strasse" /><br />
      <F k="plz" /> <F k="ort" /><br />
      <F k="land" />
    </>
  );
}

// ─── Impressum ────────────────────────────────────────────────────────────────

export function Impressum() {
  return (
    <LegalLayout title="Impressum">
      <ReviewNote />

      <H2>Angaben gemäß § 5 ECG, § 25 MedienG und § 14 UGB</H2>
      <P><Anschrift /></P>

      <H3>Vertretungsbefugte</H3>
      <P><F k="geschaeftsfuehrung" /></P>

      <H3>Kontakt</H3>
      <P>
        Telefon: <F k="telefon" /><br />
        E-Mail: <F k="email" />
      </P>

      <H3>Registerangaben</H3>
      <P>
        Firmenbuchnummer: <F k="firmenbuchnummer" /><br />
        Firmenbuchgericht: <F k="firmenbuchgericht" /><br />
        UID-Nummer: <F k="uid" /><br />
        Mitgliedschaft: <F k="kammer" /><br />
        Anwendbare Rechtsvorschriften: Gewerbeordnung, abrufbar
        unter <A href="https://www.ris.bka.gv.at">ris.bka.gv.at</A>
      </P>

      <H3>Aufsichtsbehörde</H3>
      <P><F k="gewerbebehoerde" /></P>

      <H2>Zweck dieser Plattform</H2>
      <P>
        Die ServiceQ Lernplattform stellt Schulungsinhalte für Mitarbeiterinnen
        und Mitarbeiter sowie Partnerbetriebe der jeweiligen Märkte bereit. Sie
        ist kein öffentlich zugängliches Angebot; die Nutzung setzt ein
        zugewiesenes Benutzerkonto voraus.
      </P>

      <H2>Haftung für Inhalte und Links</H2>
      <P>
        Die Schulungsinhalte werden redaktionell erstellt und maschinell in die
        Sprachen der Zielmärkte übersetzt. Trotz sorgfältiger Prüfung kann für
        die Richtigkeit maschineller Übersetzungen keine Gewähr übernommen
        werden; im Zweifel gilt die Fassung in der Mastersprache.
      </P>
      <P>
        Für Inhalte verlinkter externer Seiten sind ausschließlich deren
        Betreiber verantwortlich.
      </P>

      <H2>Urheberrecht</H2>
      <P>
        Sämtliche Inhalte dieser Plattform sind urheberrechtlich geschützt. Eine
        Weitergabe an Dritte oder eine Nutzung außerhalb des jeweiligen
        Beschäftigungs- oder Partnerverhältnisses ist nicht gestattet.
      </P>

      <H2>Online-Streitbeilegung</H2>
      <P>
        Die Plattform richtet sich nicht an Verbraucherinnen und Verbraucher;
        eine Teilnahme an einem Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle findet nicht statt.
      </P>
    </LegalLayout>
  );
}

// ─── Datenschutzerklärung ─────────────────────────────────────────────────────

export function Datenschutz() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <ReviewNote />

      <P>
        Diese Erklärung beschreibt, welche personenbezogenen Daten die ServiceQ
        Lernplattform verarbeitet, zu welchem Zweck, auf welcher Rechtsgrundlage
        und wie lange. Sie richtet sich nach der Datenschutz-Grundverordnung
        (DSGVO) und dem österreichischen Datenschutzgesetz (DSG).
      </P>

      <H2>1. Verantwortlicher</H2>
      <P><Anschrift /></P>
      <P>E-Mail: <F k="email" /></P>

      <H3>Datenschutzbeauftragter</H3>
      <P>
        {R.dsb.trim()
          ? R.dsb
          : R.dsbEntfaellt
            ? "Es besteht keine Bestellpflicht nach Art. 37 DSGVO. Anfragen richten Sie bitte an die unten genannte Anlaufstelle."
            : <F k="dsb" />}
      </P>

      <H2>2. Welche Daten verarbeitet werden</H2>

      <H3>a) Kontodaten</H3>
      <P>
        Vor- und Nachname, dienstliche E-Mail-Adresse, zugewiesene Rollen
        (Lernender, Redaktion, Verwaltung), zugeordnete Märkte und Gruppen,
        Mandant sowie der Aktivierungsstatus des Kontos. Diese Daten entstehen
        bei der Einladung durch eine administrierende Person.
      </P>
      <P>
        <strong>Passwörter</strong> werden ausschließlich im Identitätsdienst
        als kryptografischer Hashwert gespeichert. Die Plattform selbst kennt
        keine Passwörter und versendet niemals eines per E-Mail – eingeladene
        Personen vergeben es selbst über einen zeitlich begrenzten Link.
      </P>

      <H3>b) Lernfortschritt</H3>
      <P>
        Welche Kapitel eine Person abgeschlossen hat, mit Zeitpunkt. Daraus
        errechnet die Oberfläche den Fortschritt je Training.
      </P>
      <P>
        <strong>Hinweis zur Mitbestimmung:</strong> Diese Daten lassen
        Rückschlüsse auf das Lernverhalten einzelner Beschäftigter zu.
        Auswertungen im Reporting erfolgen ausschließlich aggregiert; auch
        administrierende Personen sehen keine fremden Einzelfortschritte, was
        technisch in der Datenbank durchgesetzt wird. Ob und in welchem Umfang
        eine solche Verarbeitung im Beschäftigungsverhältnis zulässig ist, ist
        mit dem Betriebsrat abzustimmen und gegebenenfalls in einer
        Betriebsvereinbarung zu regeln.
      </P>

      <H3>c) Anmelde- und Sicherheitsdaten</H3>
      <P>
        Der Identitätsdienst protokolliert Anmeldungen, fehlgeschlagene Versuche
        und administrative Änderungen. Dies dient der Absicherung der Konten und
        der Nachvollziehbarkeit.
      </P>

      <H3>d) Technische Zugriffsdaten</H3>
      <P>
        Beim Aufruf werden IP-Adresse, Zeitpunkt, aufgerufene Adresse und
        Browserkennung in Server-Protokollen erfasst. Sie dienen dem Betrieb und
        der Abwehr von Missbrauch. Zur Begrenzung von Anfragen wird die
        IP-Adresse ausschließlich als Zählschlüssel verwendet und nicht
        gespeichert.
      </P>

      <H2>3. Zwecke und Rechtsgrundlagen</H2>
      <UL>
        <li>
          <strong>Bereitstellung der Schulungen und Kontoverwaltung</strong> –
          Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Beschäftigungs- bzw.
          Partnervertrags), bei Beschäftigten in Verbindung mit § 11 DSG.
        </li>
        {R.nachweispflicht.trim() && (
          <li>
            <strong>Nachweis absolvierter Schulungen</strong> –
            Art. 6 Abs. 1 lit. c DSGVO aufgrund folgender Verpflichtung:{" "}
            {R.nachweispflicht}
          </li>
        )}
        <li>
          <strong>IT-Sicherheit und Missbrauchsabwehr</strong> –
          Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb).
        </li>
        <li>
          <strong>Maschinelle Übersetzung der Schulungsinhalte</strong> –
          Art. 6 Abs. 1 lit. f DSGVO. Übermittelt werden ausschließlich
          redaktionelle Inhalte, <strong>keine personenbezogenen Daten</strong>.
        </li>
      </UL>

      <H2>4. Empfänger und Auftragsverarbeiter</H2>
      <P>
        Die folgenden Dienstleister verarbeiten Daten in unserem Auftrag. Mit
        allen bestehen Verträge nach Art. 28 DSGVO.
      </P>
      <UL>
        {EMPFAENGER.map(e => (
          <li key={e.name}>
            <strong>{e.name}</strong> – {e.zweck}. Verarbeitung in{" "}
            <strong>{e.ort}</strong>
            {e.sitz ? `; Betreibergesellschaft mit Sitz in ${e.sitz}` : ""}.
            {" "}Übermittelt werden: {e.daten}.
            {e.drittland && (
              <>
                {" "}<strong>Drittlandübermittlung:</strong> Die Übermittlung
                stützt sich auf <F k="netlifyGrundlage" />.
              </>
            )}
          </li>
        ))}
        <li>
          <strong><F k="mailDienstleister" /></strong> – Versand von Einladungen
          und Links zum Zurücksetzen von Passwörtern. Übermittelt werden Name
          und E-Mail-Adresse.
        </li>
      </UL>

      <H2>5. Speicherdauer</H2>
      <UL>
        <li>
          <strong>Konto- und Lernfortschrittsdaten:</strong> für die Dauer des
          Beschäftigungs- bzw. Partnerverhältnisses; anschließend Löschung binnen{" "}
          <F k="aufbewahrungNachAustritt" />, sofern keine Nachweispflicht
          entgegensteht.
        </li>
        {FRISTEN.map(f => (
          <li key={f.gegenstand}>
            <strong>{f.gegenstand}:</strong> {f.dauer}.
          </li>
        ))}
      </UL>
      <P>
        Eine Löschung wirkt sich auf bereits erstellte Datensicherungen erst
        nach Ablauf von deren Aufbewahrungsfrist aus.
      </P>

      <H2>6. Ihre Rechte</H2>
      <P>
        Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
        Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen Verarbeitungen
        auf Grundlage berechtigter Interessen (Art. 21 DSGVO).
      </P>
      <P>
        Wenden Sie sich dazu an <F k="datenschutzkontakt" />. Anfragen werden
        binnen eines Monats beantwortet.
      </P>
      <P>
        Unabhängig davon steht Ihnen ein Beschwerderecht bei der
        Datenschutzbehörde zu: Österreichische Datenschutzbehörde,
        Barichgasse 40–42, 1030 Wien, <A href="https://www.dsb.gv.at">dsb.gv.at</A>.
      </P>

      <H2>7. Keine automatisierte Entscheidungsfindung</H2>
      <P>
        Es findet keine automatisierte Entscheidungsfindung einschließlich
        Profilbildung nach Art. 22 DSGVO statt. Die maschinelle Übersetzung
        betrifft ausschließlich Schulungsinhalte, nicht Personen.
      </P>

      <H2>8. Cookies und lokale Speicherung</H2>
      <P>
        Die Plattform setzt keine Cookies zu Analyse- oder Werbezwecken. Für den
        Betrieb notwendig sind:
      </P>
      <UL>
        <li>
          <strong>Sitzungsspeicher des Browsers</strong> – hält das Anmeldetoken
          für die Dauer des Browser-Tabs. Es wird bewusst nicht dauerhaft
          gespeichert und ist nach dem Schließen verschwunden.
        </li>
        <li>
          <strong>Lokale Einstellung der Oberflächensprache</strong> – ohne
          Personenbezug.
        </li>
        <li>
          <strong>Sitzungscookie des Identitätsdienstes</strong> – ermöglicht die
          Anmeldung, technisch erforderlich.
        </li>
      </UL>
      <P>
        Eine Einwilligung nach § 165 Abs. 3 TKG 2021 ist für technisch
        notwendige Speicherung nicht erforderlich.
      </P>

      <H2>9. Sicherheit der Verarbeitung</H2>
      <P>
        Nach Art. 32 DSGVO sind insbesondere folgende Maßnahmen umgesetzt:
      </P>
      <UL>
        {MASSNAHMEN.map(m => (
          <li key={m.titel}><strong>{m.titel}:</strong> {m.text}</li>
        ))}
      </UL>

      <H2>10. Änderungen</H2>
      <P>
        Diese Erklärung wird angepasst, wenn sich die Verarbeitung ändert.
        Stand: <F k="standFreigabe" />.
      </P>
    </LegalLayout>
  );
}
