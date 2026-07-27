import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

// ─── Rechtsseiten ─────────────────────────────────────────────────────────────
//
// Die Texte beschreiben die TATSÄCHLICHEN Datenflüsse der Plattform: Empfänger,
// Regionen, Speicherfristen und Zwecke sind aus der laufenden Konfiguration
// abgeleitet (Realm-Einstellungen, backup.sh, Caddyfile, Supabase-Projekt).
// Das ist der Teil, den eine Vorlage aus dem Netz nicht leisten kann.
//
// Was sie NICHT sind: juristisch geprüft. Alles in eckigen Klammern kennt nur
// das Unternehmen selbst (Firmenbuch, Anschrift, Datenschutzbeauftragter), und
// die rechtliche Bewertung – insbesondere die Rechtsgrundlage für die
// Auswertung von Lernfortschritt im Beschäftigungsverhältnis – gehört in die
// Hände eures Datenschutzbeauftragten.
//
// Den Hinweisbalken blendet `VITE_LEGAL_REVIEWED=true` aus. Bewusst eine
// ausdrückliche Handlung: Wer ihn entfernt, bestätigt damit die Prüfung.

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

function ReviewNote() {
  if (REVIEWED) return null;
  return (
    <div className="rounded-lg bg-[#FDF3E4] border border-[#F5E3C6] px-4 py-3 text-[13px] text-[#B45309] mb-6">
      <strong className="block mb-1">Entwurf – juristisch noch nicht freigegeben</strong>
      Dieser Text beschreibt die tatsächlichen Datenflüsse der Plattform, ist
      aber weder anwaltlich noch vom Datenschutzbeauftragten geprüft. Angaben in
      eckigen Klammern sind zu ergänzen. Vor einem Rollout mit echten
      Personendaten ist die Prüfung nachzuholen.
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
  return <ul className="list-disc pl-6 space-y-1 mb-3">{children}</ul>;
}
function Todo({ children }: { children: React.ReactNode }) {
  return <span className="bg-[#FDF3E4] text-[#B45309] px-1 rounded">[{children}]</span>;
}

// ─── Impressum ────────────────────────────────────────────────────────────────

export function Impressum() {
  return (
    <LegalLayout title="Impressum">
      <ReviewNote />

      <H2>Angaben gemäß § 5 ECG, § 25 MedienG und § 14 UGB</H2>
      <P>
        GroupIT – After Sales IT<br />
        <Todo>Vollständige Firmenbezeichnung laut Firmenbuch</Todo><br />
        <Todo>Straße und Hausnummer</Todo><br />
        <Todo>PLZ, Ort</Todo><br />
        Österreich
      </P>

      <H3>Vertretungsbefugte</H3>
      <P><Todo>Geschäftsführung, vollständige Namen</Todo></P>

      <H3>Kontakt</H3>
      <P>
        Telefon: <Todo>Nummer</Todo><br />
        E-Mail: <Todo>Adresse</Todo>
      </P>

      <H3>Registerangaben</H3>
      <P>
        Firmenbuchnummer: <Todo>FN ……</Todo><br />
        Firmenbuchgericht: <Todo>Gericht</Todo><br />
        UID-Nummer: <Todo>ATU……</Todo><br />
        Mitgliedschaft: <Todo>Wirtschaftskammer, Fachgruppe</Todo><br />
        Anwendbare Rechtsvorschriften: Gewerbeordnung (<a className="text-[#007D78] hover:underline" href="https://www.ris.bka.gv.at" target="_blank" rel="noreferrer noopener">ris.bka.gv.at</a>)
      </P>

      <H3>Aufsichtsbehörde</H3>
      <P><Todo>Zuständige Gewerbebehörde / Bezirkshauptmannschaft</Todo></P>

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
      <P>
        <Todo>Firmenbezeichnung</Todo><br />
        <Todo>Anschrift</Todo><br />
        E-Mail: <Todo>Adresse</Todo>
      </P>

      <H3>Datenschutzbeauftragter</H3>
      <P>
        <Todo>Name und Kontaktdaten – bzw. ausdrücklicher Vermerk, dass keine
        Bestellpflicht nach Art. 37 DSGVO besteht</Todo>
      </P>

      <H2>2. Welche Daten verarbeitet werden</H2>

      <H3>a) Kontodaten</H3>
      <P>
        Vor- und Nachname, dienstliche E-Mail-Adresse, zugewiesene Rollen
        (Lernender, Redaktion, Verwaltung), zugeordnete Märkte, Mandant sowie
        der Aktivierungsstatus des Kontos. Diese Daten entstehen bei der
        Einladung durch eine administrierende Person.
      </P>
      <P>
        <strong>Passwörter</strong> werden ausschließlich im Identitätsdienst
        (Keycloak) als kryptografischer Hashwert gespeichert. Die Plattform
        selbst kennt keine Passwörter und versendet niemals eines per E-Mail –
        eingeladene Personen vergeben es selbst über einen zeitlich begrenzten
        Link.
      </P>

      <H3>b) Lernfortschritt</H3>
      <P>
        Welche Kapitel eine Person abgeschlossen hat, mit Zeitpunkt. Daraus
        errechnet die Oberfläche den Fortschritt je Training.
      </P>
      <P>
        <strong>Wichtiger Hinweis für den Betriebsrat:</strong> Diese Daten
        lassen Rückschlüsse auf das Lernverhalten einzelner Beschäftigter zu.
        Auswertungen im Reporting erfolgen ausschließlich aggregiert, ohne
        Personenbezug – auch administrierende Personen sehen keine fremden
        Einzelfortschritte. Ob und in welchem Umfang eine solche Verarbeitung im
        Beschäftigungsverhältnis zulässig ist, ist <Todo>mit dem Betriebsrat
        abzustimmen und gegebenenfalls in einer Betriebsvereinbarung zu
        regeln</Todo>.
      </P>

      <H3>c) Anmelde- und Sicherheitsdaten</H3>
      <P>
        Der Identitätsdienst protokolliert Anmeldungen, fehlgeschlagene Versuche
        und administrative Änderungen. Dies dient der Absicherung der Konten
        (Sperre nach zehn Fehlversuchen) und der Nachvollziehbarkeit.
      </P>

      <H3>d) Technische Zugriffsdaten</H3>
      <P>
        Beim Aufruf werden IP-Adresse, Zeitpunkt, aufgerufene Adresse und
        Browserkennung in Server-Protokollen erfasst. Sie dienen dem Betrieb und
        der Abwehr von Missbrauch.
      </P>

      <H2>3. Zwecke und Rechtsgrundlagen</H2>
      <UL>
        <li>
          <strong>Bereitstellung der Schulungen und Kontoverwaltung</strong> –
          Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des Beschäftigungs- bzw.
          Partnervertrags), bei Beschäftigten in Verbindung mit § 11 DSG.
        </li>
        <li>
          <strong>Nachweis absolvierter Schulungen</strong> –
          Art. 6 Abs. 1 lit. c DSGVO, soweit eine gesetzliche oder vertragliche
          Nachweispflicht besteht. <Todo>Konkrete Pflicht benennen, falls
          einschlägig</Todo>
        </li>
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
        allen sind Verträge nach Art. 28 DSGVO zu schließen
        <Todo>Abschluss dokumentieren</Todo>.
      </P>
      <UL>
        <li>
          <strong>Supabase</strong> – Datenbank der Plattform (Konten,
          Lernfortschritt, Inhalte). Verarbeitung in der <strong>Region Irland
          (EU)</strong>. Betreibergesellschaft mit Sitz in den USA; für
          Zugriffe aus dem Support sind geeignete Garantien nach Kapitel V
          DSGVO erforderlich.
        </li>
        <li>
          <strong>Netlify</strong> – Auslieferung der Weboberfläche und Betrieb
          der Serverfunktionen. <strong>Netlify Inc. hat seinen Sitz in den
          USA</strong>; die Auslieferung erfolgt über ein weltweites
          Verteilnetz. Es handelt sich um eine Drittlandübermittlung, für die
          Standardvertragsklauseln bzw. eine Zertifizierung nach dem EU-US Data
          Privacy Framework erforderlich sind. <Todo>Grundlage benennen</Todo>
        </li>
        <li>
          <strong>Hetzner Online GmbH</strong> – Server des Identitätsdienstes
          (Keycloak) einschließlich Benutzerkonten und Anmeldeprotokollen.
          Rechenzentrum <Todo>Standort laut Hetzner-Konsole eintragen</Todo>.
        </li>
        <li>
          <strong>Mistral AI</strong> (Frankreich) – maschinelle Übersetzung der
          Schulungsinhalte. Es werden ausschließlich redaktionelle Texte
          übermittelt, keine Kontodaten und kein Lernfortschritt.
        </li>
        <li>
          <strong><Todo>E-Mail-Dienstleister</Todo></strong> – Versand von
          Einladungen und Links zum Zurücksetzen von Passwörtern. Übermittelt
          werden Name und E-Mail-Adresse.
        </li>
      </UL>

      <H2>5. Speicherdauer</H2>
      <UL>
        <li>
          <strong>Konto- und Lernfortschrittsdaten:</strong> für die Dauer des
          Beschäftigungs- bzw. Partnerverhältnisses; anschließend Löschung
          binnen <Todo>Frist festlegen</Todo>, sofern keine Nachweispflicht
          entgegensteht.
        </li>
        <li>
          <strong>Anmelde- und Administrationsereignisse:</strong> 30 Tage,
          danach automatische Löschung durch den Identitätsdienst.
        </li>
        <li>
          <strong>Server-Zugriffsprotokolle:</strong> rollierend, jeweils die
          fünf jüngsten Dateien à 10 MB.
        </li>
        <li>
          <strong>Datensicherungen der Benutzerdatenbank:</strong> täglich,
          Aufbewahrung 14 Tage. Eine Löschung wirkt sich auf ältere Sicherungen
          erst nach Ablauf dieser Frist aus.
        </li>
      </UL>

      <H2>6. Ihre Rechte</H2>
      <P>
        Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
        Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen Verarbeitungen
        auf Grundlage berechtigter Interessen (Art. 21 DSGVO).
      </P>
      <P>
        Wenden Sie sich dazu an <Todo>Kontaktstelle</Todo>. Anfragen werden
        binnen eines Monats beantwortet.
      </P>
      <P>
        Unabhängig davon steht Ihnen ein Beschwerderecht bei der
        Datenschutzbehörde zu: Österreichische Datenschutzbehörde,
        Barichgasse 40–42, 1030 Wien,{" "}
        <a className="text-[#007D78] hover:underline" href="https://www.dsb.gv.at" target="_blank" rel="noreferrer noopener">dsb.gv.at</a>.
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
          <strong>Sitzungsspeicher des Browsers</strong> – hält das
          Anmeldetoken für die Dauer des Browser-Tabs. Es wird bewusst nicht
          dauerhaft gespeichert und ist nach dem Schließen verschwunden.
        </li>
        <li>
          <strong>Lokale Einstellung der Oberflächensprache</strong> – enthält
          keinen Personenbezug.
        </li>
        <li>
          <strong>Sitzungscookie des Identitätsdienstes</strong> – ermöglicht
          die Anmeldung, technisch erforderlich.
        </li>
      </UL>
      <P>
        Eine Einwilligung nach § 165 Abs. 3 TKG 2021 ist für technisch
        notwendige Speicherung nicht erforderlich.
      </P>

      <H2>9. Sicherheit der Verarbeitung</H2>
      <P>
        Die Übertragung erfolgt ausschließlich verschlüsselt (TLS). Der Zugriff
        auf Fachdaten wird in der Datenbank selbst durchgesetzt: Lernende sehen
        ausschließlich die ihnen zugewiesenen Trainings und niemals den
        Lernfortschritt anderer Personen. Anmeldungen sind gegen wiederholtes
        Ausprobieren geschützt; für Passwörter gilt eine Mindestlänge von zwölf
        Zeichen.
      </P>

      <H2>10. Änderungen</H2>
      <P>
        Diese Erklärung wird angepasst, wenn sich die Verarbeitung ändert.
        Stand: <Todo>Datum der Freigabe</Todo>.
      </P>
    </LegalLayout>
  );
}
