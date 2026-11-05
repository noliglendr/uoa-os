#!/bin/sh
# Database tests: a fresh database, a stub of Supabase's auth schema, every
# migration, then the test files and the seed (all rolled back).
# Uses the standard PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# The database named by TEST_DB (default uoa_test) is dropped and recreated.
set -e
DB=${TEST_DB:-uoa_test}
DIR=$(dirname "$0")
psql -q -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
run() { psql -q -t -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run -f "$DIR/auth_stub.sql"
for f in "$DIR"/../migrations/*.sql; do run -f "$f"; done
run -f "$DIR/foundation.test.sql" | grep PASSED
run -f "$DIR/matters.test.sql" | grep PASSED
run -f "$DIR/admin.test.sql" | grep PASSED
run -f "$DIR/roles.test.sql" | grep PASSED
run -f "$DIR/corrections.test.sql" | grep PASSED
run <<SQL
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, display_name, role) values ('00000000-0000-0000-0000-00000000000a', 'Seed Principal', 'principal');
\i $DIR/../seed/matters_abc.sql
set constraints all immediate;
do \$\$ begin assert (select count(*) from public.matters) = 3, 'seed creates three matters'; end \$\$;
rollback;
SQL
echo "SEED OK"
