-- The select policy joined contact_custom_fields to itself, which Postgres
-- reports as "infinite recursion detected in policy". The "manage" policy
-- (for all) already covers reads, so the broken one is simply dropped.
drop policy if exists "Users can view contact custom fields" on contact_custom_fields;
