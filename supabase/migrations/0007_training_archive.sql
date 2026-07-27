-- Trainings bleiben für Historie und Übersetzungen erhalten, sind aber für
-- Lernende unsichtbar. Eigene Migration, weil PostgreSQL neue Enum-Werte erst
-- nach dem Commit in weiteren Funktionen verwenden darf.
alter type training_status add value if not exists 'archived';
