-- ============================================================
-- ServiceQ Lernplattform – Seed-Daten
-- Struktur nach Konzept §4 (ServiceQ-Beispielbaum),
-- Demo-Übersetzungsstatus nach Designbriefing §12.
-- Feste UUIDs, damit Referenzen lesbar und Läufe reproduzierbar sind.
-- ============================================================

-- ---------- Sprachen ----------
insert into language (code, name) values
  ('de', 'Deutsch'),
  ('en', 'Englisch'),
  ('fr', 'Französisch'),
  ('pl', 'Polnisch'),
  ('it', 'Italienisch'),
  ('es', 'Spanisch'),
  ('nl', 'Niederländisch'),
  ('cs', 'Tschechisch'),
  ('pt', 'Portugiesisch'),
  ('el', 'Griechisch'),
  ('hu', 'Ungarisch'),
  ('sv', 'Schwedisch')
on conflict (code) do nothing;

-- ---------- Märkte ----------
insert into market (id, name, code) values
  ('a0000000-0000-4000-8000-000000000001', 'Deutschland',  'DE'),
  ('a0000000-0000-4000-8000-000000000002', 'Frankreich',   'FR'),
  ('a0000000-0000-4000-8000-000000000003', 'Polen',        'PL'),
  ('a0000000-0000-4000-8000-000000000004', 'Italien',      'IT'),
  ('a0000000-0000-4000-8000-000000000005', 'Spanien',      'ES'),
  ('a0000000-0000-4000-8000-000000000006', 'Niederlande',  'NL'),
  ('a0000000-0000-4000-8000-000000000007', 'Tschechien',   'CZ'),
  ('a0000000-0000-4000-8000-000000000008', 'Österreich',   'AT'),
  ('a0000000-0000-4000-8000-000000000009', 'Schweiz',      'CH'),
  ('a0000000-0000-4000-8000-00000000000a', 'Schweden',     'SE')
on conflict (code) do nothing;

insert into market_language (market_id, language_code, is_default) values
  ('a0000000-0000-4000-8000-000000000001', 'de', true),
  ('a0000000-0000-4000-8000-000000000002', 'fr', true),
  ('a0000000-0000-4000-8000-000000000003', 'pl', true),
  ('a0000000-0000-4000-8000-000000000004', 'it', true),
  ('a0000000-0000-4000-8000-000000000005', 'es', true),
  ('a0000000-0000-4000-8000-000000000006', 'nl', true),
  ('a0000000-0000-4000-8000-000000000007', 'cs', true),
  ('a0000000-0000-4000-8000-000000000008', 'de', true),
  ('a0000000-0000-4000-8000-000000000009', 'de', true),
  ('a0000000-0000-4000-8000-000000000009', 'fr', false),
  ('a0000000-0000-4000-8000-000000000009', 'it', false),
  ('a0000000-0000-4000-8000-00000000000a', 'sv', true)
on conflict do nothing;

-- ---------- Produkt & Module (Konzept §4) ----------
insert into product (id, slug, title, description, sort) values
  ('b0000000-0000-4000-8000-000000000001', 'serviceq', 'ServiceQ',
   'After-Sales-Plattform: Digital Service Reception, Repair Documentation, Customer Communication und Online Check-In.', 1);

insert into module (id, product_id, slug, title, description, sort) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'dsr', 'Digital Service Reception (DSR)', 'Digitale Serviceannahme: Konfiguration und Arbeitsabläufe.', 1),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
   'rpd', 'Repair Documentation (RPD)', 'Reparaturdokumentation im Werkstattalltag.', 2),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
   'ccd', 'Customer Communication Dashboard (CCD)', 'Kundenkommunikation rund um den Werkstatttermin.', 3),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001',
   'online-check-in', 'Online Check-In', 'Vorbereitung und Aktivierung des Online Check-In.', 4);

-- ---------- Trainings (Konzept §4) ----------
insert into training (id, module_id, slug, title, description, status, master_language, published_at) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'dsr-konfiguration-einzelhandel', 'DSR – Konfiguration im Einzelhandel',
   'Konfigurationsebenen, Systemeinstellungen (CDM) und DealerData für die digitale Serviceannahme.',
   'published', 'de', now()),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'dsrconfig-modul-1a', 'DSRconfig (Modul 1A)',
   'Vertiefung: DSR-Konfigurationswerkzeug.', 'draft', 'de', null),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002',
   'rpd-werkstattalltag', 'RPD im Werkstattalltag',
   'Reparaturdokumentation Schritt für Schritt.', 'published', 'de', now()),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002',
   'rpc-checklisten', 'Checklisten konfigurieren (RPC / Modul 2A)',
   'Checklisten für die Reparaturdokumentation anlegen und pflegen.', 'draft', 'de', null),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000003',
   'ccc-konfiguration', 'CCC – Konfiguration (Modul 3A)',
   'Customer Communication Center einrichten.', 'draft', 'de', null),
  ('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000004',
   'vorbereitung-aktivierung', 'Vorbereitung & Aktivierung',
   'Online Check-In für den Betrieb vorbereiten und aktivieren.', 'published', 'de', now());

-- Marktzuordnung: veröffentlichte Trainings für alle Märkte
insert into training_market (training_id, market_id)
select t.id, m.id from training t cross join market m
where t.status = 'published'
on conflict do nothing;

-- ---------- Kapitel & Elemente: "DSR – Konfiguration im Einzelhandel" ----------
insert into chapter (id, training_id, title, sort) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'Überblick & Konfigurationsebenen', 1),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'Rollen & Rechte (Dealer_Admin)', 2);

insert into content_element (id, chapter_id, type, sort, payload) values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'video', 1,
   '{"title": "Einführung DSR", "description": "Überblick über die Digital Service Reception in 6 Minuten."}'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'text', 2,
   '{"body": "<h3>Systemeinstellungen (CDM) im Überblick</h3><p>Die zentralen Systemeinstellungen der Digital Service Reception werden im Central Data Management (CDM) gepflegt. Änderungen wirken auf alle angeschlossenen Betriebe; betriebsspezifische Abweichungen werden in den DealerData-Einstellungen hinterlegt.</p>"}'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001', 'steps', 3,
   '{"title": "DealerData-Einstellungen", "steps": [
      {"text": "DealerData öffnen und den Betrieb auswählen."},
      {"text": "Reiter „Serviceannahme" wählen und die Konfigurationsebene prüfen."},
      {"text": "Abweichende Einstellungen für den Einzelhandel erfassen."},
      {"text": "Änderungen speichern und im Vorschaumodus kontrollieren."}
    ]}'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002', 'text', 1,
   '{"body": "<h3>Rollenmodell</h3><p>Die Rolle <strong>Dealer_Admin</strong> vergibt Berechtigungen innerhalb des Betriebs. Sie legt fest, welche Mitarbeitenden Terminannahme, Direktannahme und Auftragsbearbeitung nutzen dürfen.</p>"}'),
  ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000002', 'link', 2,
   '{"label": "ServiceQ-Handbuch: Rollen & Rechte", "url": "https://example.com/serviceq/handbuch/rollen"}');

-- Kapitel für die weiteren veröffentlichten Trainings
insert into chapter (id, training_id, title, sort) values
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'Grundlagen der Reparaturdokumentation', 1),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000003', 'Dokumentieren am Fahrzeug', 2),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000006', 'Voraussetzungen prüfen', 1),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000006', 'Aktivierung durchführen', 2);

insert into content_element (id, chapter_id, type, sort, payload) values
  ('f0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000003', 'text', 1,
   '{"body": "<p>RPD dokumentiert Befunde und Arbeitsschritte direkt am Auftrag – nachvollziehbar für Werkstatt, Serviceberatung und Kundschaft.</p>"}'),
  ('f0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000005', 'text', 1,
   '{"body": "<p>Vor der Aktivierung des Online Check-In müssen DSR-Konfiguration und Terminverwaltung eingerichtet sein.</p>"}');

-- ---------- Demo-Übersetzungen (gemischte Status, Briefing §12) ----------
insert into translation (ref_type, ref_id, field, language_code, text, status, source_hash) values
  -- Französisch: überwiegend automatisch, 1 korrigiert, 1 veraltet, 1 Fehler
  ('training', 'd0000000-0000-4000-8000-000000000001', 'title', 'fr',
   'DSR – Configuration dans le commerce de détail', 'auto', 'h1'),
  ('training', 'd0000000-0000-4000-8000-000000000001', 'description', 'fr',
   'Niveaux de configuration, paramètres système (CDM) et DealerData pour la réception de service numérique.', 'edited', 'h2'),
  ('chapter', 'e0000000-0000-4000-8000-000000000001', 'title', 'fr',
   'Aperçu et niveaux de configuration', 'outdated', 'h3'),
  ('chapter', 'e0000000-0000-4000-8000-000000000002', 'title', 'fr',
   null, 'error', 'h4'),
  ('content_element', 'f0000000-0000-4000-8000-000000000001', 'title', 'fr',
   'Introduction à la DSR', 'auto', 'h5'),
  -- Polnisch: automatisch + 1 fehlend
  ('training', 'd0000000-0000-4000-8000-000000000001', 'title', 'pl',
   'DSR – Konfiguracja w handlu detalicznym', 'auto', 'h1'),
  ('chapter', 'e0000000-0000-4000-8000-000000000001', 'title', 'pl',
   'Przegląd i poziomy konfiguracji', 'auto', 'h3'),
  ('chapter', 'e0000000-0000-4000-8000-000000000002', 'title', 'pl',
   null, 'missing', null),
  -- Italienisch: vollständig automatisch
  ('training', 'd0000000-0000-4000-8000-000000000001', 'title', 'it',
   'DSR – Configurazione nel commercio al dettaglio', 'auto', 'h1'),
  ('chapter', 'e0000000-0000-4000-8000-000000000001', 'title', 'it',
   'Panoramica e livelli di configurazione', 'auto', 'h3')
on conflict (ref_type, ref_id, field, language_code) do nothing;
