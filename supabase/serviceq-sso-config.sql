-- ============================================================
-- ServiceQ-SSO: Demo-Konfiguration für einen schnell lauffähigen Prototyp
--
-- Registriert EINEN ServiceQ-Systemclient mit der einfachen
-- client_secret-Authentifizierung (für den Prototyp; produktiv:
-- private_key_jwt, siehe Befund B4).
--
-- ⚠️  DEMO-Secret. Vor jeder ernsthaften Nutzung ersetzen:
--     Klartext-Secret:  serviceq-demo-secret-bitte-aendern
--     (SHA-256 unten). Neues Secret erzeugen und Hash ersetzen:
--     node -e "console.log(require('crypto').createHash('sha256').update('DEIN_SECRET').digest('hex'))"
-- ============================================================

insert into sso_client (
  client_id, display_name, auth_method, client_secret_hash,
  allowed_tenants, allowed_roles, allowed_target_types,
  default_role, return_url, enabled
) values (
  'serviceq-demo',
  'ServiceQ (Demo-Client)',
  'client_secret',
  '6b846ea9348dfb31948f640854f6ab87a7d29a0da1c3991a937ce476a33163ca', -- sha256('serviceq-demo-secret-bitte-aendern')
  array['PHS_AT', 'PHS_DE'],
  array['trainer', 'dealer_manager', 'learner'],   -- Zielrollen, Priorität hoch→niedrig
  array['home', 'training', 'learning_path'],
  'learner',
  'https://serviceq.example.com/academy/return',   -- Rückleitung (nur aus Config, B7)
  true
)
on conflict (client_id) do update set
  client_secret_hash = excluded.client_secret_hash,
  allowed_tenants = excluded.allowed_tenants,
  allowed_roles = excluded.allowed_roles,
  allowed_target_types = excluded.allowed_target_types,
  return_url = excluded.return_url,
  enabled = excluded.enabled;

-- Rollen-Allowlist (ServiceQ-Rolle → Academy-Rolle, B12)
insert into sso_role_map (client_id, serviceq_role, academy_role) values
  ('serviceq-demo', 'service_advisor', 'learner'),
  ('serviceq-demo', 'dealer_admin',    'dealer_manager'),
  ('serviceq-demo', 'market_trainer',  'trainer')
on conflict (client_id, serviceq_role) do update set academy_role = excluded.academy_role;
