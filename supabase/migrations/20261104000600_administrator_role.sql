-- New role: Administrator. Runs the system (staff, settings) but approves
-- nothing legal. Its rules are in the next migration: a new enum value can
-- only be used after the statement that adds it has committed.
alter type public.app_role add value if not exists 'administrator';
