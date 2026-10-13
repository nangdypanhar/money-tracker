-- RLS / function checks for 0001_cloud_backup.sql. Run against a TEST project (SQL editor or psql as postgres):
-- everything happens in one transaction that is rolled back, so it leaves nothing behind.
-- Any failed check raises an exception; success prints "backup RLS checks passed".
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'rls-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'rls-b@example.invalid');

create or replace function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true),
         set_config('role', 'authenticated', true);
$$;

-- User A sets up a key, a device, and one snapshot.
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
insert into public.backup_keys (wrapped_dek, wrap_iv) values (repeat('k', 40), repeat('i', 16));
insert into public.backup_devices (id) values ('00000000-0000-4000-8000-0000000000d1');
do $$
declare r jsonb;
begin
  r := public.commit_backup('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    1, 1::smallint, repeat('i', 16), 'Y2lwaGVy', repeat('a', 64));
  assert r->>'status' = 'ok', 'first commit ok';
  -- Duplicate request: same snapshot id → duplicate, no new row.
  r := public.commit_backup('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1',
    1, 1::smallint, repeat('i', 16), 'Y2lwaGVy', repeat('a', 64));
  assert r->>'status' = 'duplicate', 'retry is a duplicate';
  -- Stale: a new snapshot id at an old revision is refused.
  r := public.commit_backup('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e2',
    1, 1::smallint, repeat('i', 16), 'Y2lwaGVy', repeat('b', 64));
  assert r->>'status' = 'stale' and (r->>'headRevision')::int = 1, 'older revision is stale';
  assert (select count(*) from public.backup_snapshots) = 1, 'A sees exactly one snapshot';
  -- Direct writes are not allowed, even for your own rows.
  begin
    insert into public.backup_snapshots (id, user_id, device_id, revision, format, iv, ciphertext, sha256, size_bytes)
    values (gen_random_uuid(), auth.uid(), '00000000-0000-4000-8000-0000000000d1', 5, 1, repeat('i', 16), 'x', repeat('c', 64), 1);
    raise exception 'direct snapshot insert should fail';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.backup_devices set head_revision = 0;
    raise exception 'direct head update should fail';
  exception when insufficient_privilege then null;
  end;
  -- Can't register a device with a forged head.
  begin
    insert into public.backup_devices (id, head_revision) values (gen_random_uuid(), 50);
    raise exception 'forged head should fail';
  exception when insufficient_privilege then null;
  end;
end $$;

-- User B: sees nothing of A's, and can't write into A's device or claim A's ids.
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
do $$
begin
  assert (select count(*) from public.backup_keys) = 0, 'B cannot read A key';
  assert (select count(*) from public.backup_devices) = 0, 'B cannot read A devices';
  assert (select count(*) from public.backup_snapshots) = 0, 'B cannot read A snapshots';
  begin
    perform public.commit_backup('00000000-0000-4000-8000-0000000000d1', gen_random_uuid(), 9, 1::smallint,
      repeat('i', 16), 'eA==', repeat('d', 64));
    raise exception 'B committing to A device should fail';
  exception when no_data_found then null;
  end;
  begin
    insert into public.backup_keys (user_id, wrapped_dek, wrap_iv)
    values ('00000000-0000-4000-8000-00000000000a', repeat('k', 40), repeat('i', 16));
    raise exception 'B writing a key for A should fail';
  exception when insufficient_privilege or unique_violation then null;
  end;
  begin
    insert into public.backup_devices (id, user_id) values (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a');
    raise exception 'B registering a device for A should fail';
  exception when insufficient_privilege then null;
  end;
  perform public.delete_my_backups(); -- only deletes B's (none)
end $$;

-- Anonymous (no login): nothing.
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('role', 'anon', true);
do $$
begin
  begin
    perform count(*) from public.backup_snapshots;
    raise exception 'anon read should fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.commit_backup(gen_random_uuid(), gen_random_uuid(), 1, 1::smallint, repeat('i', 16), 'eA==', repeat('e', 64));
    raise exception 'anon commit should fail';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A's data survived B's delete_my_backups.
reset role;
do $$
begin
  assert (select count(*) from public.backup_snapshots where user_id = '00000000-0000-4000-8000-00000000000a') = 1,
    'A snapshot still there';
  raise notice 'backup RLS checks passed';
end $$;

rollback;
