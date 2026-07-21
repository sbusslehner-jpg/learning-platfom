-- ============================================================
-- ServiceQ Lernplattform – Initiales Schema
-- Datenmodell nach Konzept §8 (docs/konzept.md)
-- ============================================================

-- ---------- Enums ----------
create type user_role as enum ('admin', 'editor', 'user');
create type training_status as enum ('draft', 'published');
create type element_type as enum ('text', 'steps', 'video', 'image', 'document', 'link');
create type translation_status as enum ('missing', 'auto', 'edited', 'outdated', 'error');
create type translation_ref_type as enum ('product', 'module', 'training', 'chapter', 'content_element');
create type job_status as enum ('queued', 'running', 'done', 'failed');

-- ---------- Sprachen & Märkte ----------
create table language (
  code text primary key,                -- z. B. 'de', 'fr'
  name text not null
);

create table market (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique             -- z. B. 'DE', 'FR'
);

create table market_language (
  market_id uuid not null references market(id) on delete cascade,
  language_code text not null references language(code) on delete restrict,
  is_default boolean not null default false,
  primary key (market_id, language_code)
);

-- genau eine Standardsprache je Markt
create unique index market_default_language on market_language (market_id) where is_default;

-- ---------- Benutzer ----------
-- auth_id wird später mit auth.users (Supabase Auth) verknüpft; bis dahin nullable.
create table app_user (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,
  name text not null,
  email text not null unique,
  ui_language text references language(code),
  created_at timestamptz not null default now()
);

-- Rollen sind additiv (Konzept §2: Admin kann zusätzlich Editor sein)
create table user_role_assignment (
  user_id uuid not null references app_user(id) on delete cascade,
  role user_role not null,
  primary key (user_id, role)
);

create table user_market (
  user_id uuid not null references app_user(id) on delete cascade,
  market_id uuid not null references market(id) on delete cascade,
  primary key (user_id, market_id)
);

create table user_product (
  user_id uuid not null references app_user(id) on delete cascade,
  product_id uuid not null,             -- FK folgt nach Definition von product
  primary key (user_id, product_id)
);

-- ---------- Inhaltsstruktur: Produkt → Modul → Training → Kapitel → Element ----------
-- Master-Texte (Titel/Beschreibung) liegen an der Entität selbst,
-- Übersetzungen feldweise in der polymorphen Tabelle "translation".
create table product (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  sort int not null default 0
);

alter table user_product
  add constraint user_product_product_fk
  foreign key (product_id) references product(id) on delete cascade;

create table module (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  sort int not null default 0,
  unique (product_id, slug)
);

create table training (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references module(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  status training_status not null default 'draft',
  master_language text not null default 'de' references language(code),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, slug)
);

create table training_market (
  training_id uuid not null references training(id) on delete cascade,
  market_id uuid not null references market(id) on delete cascade,
  primary key (training_id, market_id)
);

create table chapter (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references training(id) on delete cascade,
  title text not null,
  sort int not null default 0
);

-- payload je Elementtyp (Konzept §4), z. B.
--   text:     { "body": "<p>…</p>" }
--   steps:    { "steps": [{ "text": "…", "image_asset_id": null }] }
--   video:    { "title": "…", "description": "…" }
--   image:    { "caption": "…" }
--   document: { "label": "…" }
--   link:     { "label": "…", "url": "https://…" }
create table content_element (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapter(id) on delete cascade,
  type element_type not null,
  sort int not null default 0,
  payload jsonb not null default '{}'::jsonb
);

-- Mediendateien; language_code NULL = Master-Datei, gesetzt = Sprachvariante (Konzept §4)
create table asset (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references content_element(id) on delete cascade,
  language_code text references language(code),
  file_key text not null,               -- Pfad im Storage-Bucket
  mime text not null,
  created_at timestamptz not null default now()
);

-- ---------- Übersetzungen (polymorph, feldweise – Konzept §5/§8) ----------
create table translation (
  id uuid primary key default gen_random_uuid(),
  ref_type translation_ref_type not null,
  ref_id uuid not null,
  field text not null,                  -- z. B. 'title', 'description', 'body', 'steps.2.text'
  language_code text not null references language(code),
  text text,
  status translation_status not null default 'missing',
  source_hash text,                     -- Hash des Quelltexts für Delta-Erkennung
  updated_at timestamptz not null default now(),
  updated_by uuid references app_user(id),
  unique (ref_type, ref_id, field, language_code)
);

create index translation_ref on translation (ref_type, ref_id);
create index translation_status_idx on translation (status, language_code);

create table translation_job (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references training(id) on delete cascade,
  language_code text not null references language(code),
  status job_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  error_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Lernfortschritt (angesehen = abgeschlossen, Konzept §3 D) ----------
create table progress (
  user_id uuid not null references app_user(id) on delete cascade,
  chapter_id uuid not null references chapter(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  completed boolean not null default true,
  primary key (user_id, chapter_id)
);

-- ---------- Einstellungen (u. a. Mistral-API-Key, nur verschlüsselt) ----------
create table setting (
  key text primary key,
  value_encrypted text not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- Phase 1 (ohne Login): veröffentlichte Inhalte sind öffentlich lesbar,
-- alles andere ist gesperrt. Schreibzugriffe laufen ausschließlich über
-- den Service-Role-Key (Server/Worker), der RLS umgeht.
-- Mit Einführung von Supabase Auth werden die Policies auf
-- Markt-/Produkt-/Rollenprüfung (auth_id) verfeinert.
-- ============================================================

alter table language              enable row level security;
alter table market                enable row level security;
alter table market_language       enable row level security;
alter table app_user              enable row level security;
alter table user_role_assignment  enable row level security;
alter table user_market           enable row level security;
alter table user_product          enable row level security;
alter table product               enable row level security;
alter table module                enable row level security;
alter table training              enable row level security;
alter table training_market       enable row level security;
alter table chapter               enable row level security;
alter table content_element       enable row level security;
alter table asset                 enable row level security;
alter table translation           enable row level security;
alter table translation_job       enable row level security;
alter table progress              enable row level security;
alter table setting               enable row level security;

-- Stammdaten: öffentlich lesbar
create policy "language_read"        on language        for select using (true);
create policy "market_read"          on market          for select using (true);
create policy "market_language_read" on market_language for select using (true);

-- Inhaltsstruktur: nur veröffentlichte Trainings (und deren Eltern/Kinder)
create policy "product_read" on product for select using (true);
create policy "module_read"  on module  for select using (true);

create policy "training_read_published" on training
  for select using (status = 'published');

create policy "training_market_read" on training_market
  for select using (
    exists (select 1 from training t where t.id = training_id and t.status = 'published')
  );

create policy "chapter_read_published" on chapter
  for select using (
    exists (select 1 from training t where t.id = training_id and t.status = 'published')
  );

create policy "element_read_published" on content_element
  for select using (
    exists (
      select 1 from chapter c
      join training t on t.id = c.training_id
      where c.id = chapter_id and t.status = 'published'
    )
  );

create policy "asset_read_published" on asset
  for select using (
    exists (
      select 1 from content_element e
      join chapter c on c.id = e.chapter_id
      join training t on t.id = c.training_id
      where e.id = element_id and t.status = 'published'
    )
  );

-- Übersetzungen: nur Felder veröffentlichter Trainings bzw. von Produkt/Modul
create policy "translation_read_published" on translation
  for select using (
    ref_type in ('product', 'module')
    or (ref_type = 'training' and exists (
      select 1 from training t where t.id = ref_id and t.status = 'published'))
    or (ref_type = 'chapter' and exists (
      select 1 from chapter c join training t on t.id = c.training_id
      where c.id = ref_id and t.status = 'published'))
    or (ref_type = 'content_element' and exists (
      select 1 from content_element e
      join chapter c on c.id = e.chapter_id
      join training t on t.id = c.training_id
      where e.id = ref_id and t.status = 'published'))
  );

-- Bewusst KEINE Policies (= kein anon-Zugriff) für:
-- app_user, user_role_assignment, user_market, user_product,
-- translation_job, progress, setting
