import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

// ─── Rechtsseiten (Platzhalter – vor Go-Live durch geprüfte Texte ersetzen) ───

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F8FA] flex flex-col">
      <div className="max-w-[720px] w-full mx-auto px-6 py-10 flex-1">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-[13px] text-[#007D78] hover:underline mb-6">
          <ChevronLeft size={15} /> Zurück zur Anmeldung
        </Link>
        <h1 className="text-[28px] font-semibold text-[#232830] mb-6">{title}</h1>
        <div className="bg-white rounded-xl border border-[#C3C9D1] p-6 lg:p-8 text-[15px] text-[#3A424E] leading-relaxed space-y-4 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

function PlaceholderNote() {
  return (
    <div className="rounded-lg bg-[#FDF3E4] text-[#B45309] px-4 py-3 text-[13px] font-medium">
      Platzhalter für Demonstrationszwecke — vor dem Go-Live durch juristisch geprüfte Inhalte ersetzen.
    </div>
  );
}

export function Impressum() {
  return (
    <LegalLayout title="Impressum">
      <PlaceholderNote />
      <p><strong>Angaben gemäß § 5 TMG / § 25 MedienG</strong></p>
      <p>
        GroupIT – After Sales IT<br />
        Porsche Konstruktionen GmbH &amp; Co KG<br />
        [Straße und Hausnummer]<br />
        [PLZ, Ort]
      </p>
      <p>
        Vertreten durch: [Geschäftsführung]<br />
        Kontakt: [Telefon] · [E-Mail]<br />
        Firmenbuchnummer: [Nummer] · Firmenbuchgericht: [Gericht]<br />
        UID-Nummer: [UID]
      </p>
    </LegalLayout>
  );
}

export function Datenschutz() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <PlaceholderNote />
      <p>
        Diese Lernplattform verarbeitet personenbezogene Daten (Benutzerkonten und Lernfortschritt)
        zum Zweck der Bereitstellung von Schulungsinhalten. Rechtsgrundlage, Speicherdauer und
        Betroffenenrechte werden hier vor dem Go-Live vollständig beschrieben.
      </p>
      <p><strong>Eingesetzte Auftragsverarbeiter (Stand: Demo):</strong></p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Supabase (Datenbank &amp; Authentifizierung, Region EU-Frankfurt)</li>
        <li>Netlify (Hosting der Weboberfläche)</li>
        <li>Mistral AI (automatische Übersetzung redaktioneller Inhalte — keine personenbezogenen Daten)</li>
      </ul>
      <p>Verantwortlicher, Datenschutzkontakt und Betroffenenrechte: [vor Go-Live ergänzen].</p>
    </LegalLayout>
  );
}
