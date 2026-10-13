-- MoneyTrack optional encrypted cloud backup. See .claude/skills/local-data/SKILL.md §6.
--
-- The server stores only ciphertext and the minimum metadata (ids, revision, size, hash, timestamps).
-- It can't decrypt anything: the data key is wrapped by a key derived from the user's recovery key,
-- which never leaves the device. Each user is a Supabase Auth user whose email/password are derived
-- from the recovery key (Auth → Email: "Confirm email" must be OFF; no mail is ever sent).
--
-- Clients never write snapshots directly: commit_backup() checks ownership, dedupes by snapshot id,
-- rejects revisions that aren't newer (stale), and prunes old versions.

-- Wrapped data key: one per user, in its own table (never stored alongside a snapshot).
create table public.backup_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wrapped_dek text not null check (char_length(wrapped_dek) between 16 and 200),
  wrap_iv text not null check (char_length(wrap_iv) between 8 and 40),
  kdf jsonb not null default '{"alg":"HKDF-SHA-256","v":1}'::jsonb,
  created_at timestamptz not null default now()
);

-- One backup chain per device install; head_revision only moves forward (via commit_backup).
create table public.backup_devices (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  head_revision bigint not null default 0,
  head_snapshot_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index backup_devices_user_idx on public.backup_devices (user_id);

create table public.backup_snapshots (
  id uuid primary key, -- client-generated snapshot id: the idempotency key for retries
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid not null references public.backup_devices (id) on delete cascade,
  revision bigint not null check (revision > 0),
  format smallint not null check (format between 1 and 100),
  iv text not null check (char_length(iv) between 8 and 40),
  ciphertext text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check (size_bytes between 1 and 14000000),
  created_at timestamptz not null default now(),
  unique (device_id, revision)
);
create index backup_snapshots_user_idx on public.backup_snapshots (user_id, created_at desc);

-- ------------------------------------------------------------------------------------------------ RLS

alter table public.backup_keys enable row level security;
alter table public.backup_devices enable row level security;
alter table public.backup_snapshots enable row level security;

revoke all on public.backup_keys, public.backup_devices, public.backup_snapshots from anon, authenticated;
grant select, insert on public.backup_keys to authenticated;
grant select, insert on public.backup_devices to authenticated;
grant select on public.backup_snapshots to authenticated;

create policy "read own key" on public.backup_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "create own key" on public.backup_keys
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "read own devices" on public.backup_devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "register own device" on public.backup_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and head_revision = 0 and head_snapshot_id is null);

create policy "read own snapshots" on public.backup_snapshots
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policies on snapshots: writes only through the functions below.

-- ------------------------------------------------------------------------------------------------ functions

create or replace function public.commit_backup(
  p_device_id uuid,
  p_snapshot_id uuid,
  p_revision bigint,
  p_format smallint,
  p_iv text,
  p_ciphertext text,
  p_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_head bigint;
  v_existing public.backup_snapshots%rowtype;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lock the device row: concurrent commits for one device run one at a time.
  select head_revision into v_head
  from public.backup_devices
  where id = p_device_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'unknown device' using errcode = 'P0002';
  end if;

  -- Idempotent retry: the same snapshot id was already stored.
  select * into v_existing from public.backup_snapshots where id = p_snapshot_id;
  if found then
    if v_existing.user_id <> v_uid or v_existing.device_id <> p_device_id then
      raise exception 'snapshot id conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'duplicate', 'revision', v_existing.revision,
      'createdAt', v_existing.created_at, 'headRevision', v_head);
  end if;

  -- Never let an older (or equal) revision replace a newer confirmed backup.
  if p_revision <= v_head then
    return jsonb_build_object('status', 'stale', 'headRevision', v_head);
  end if;

  insert into public.backup_snapshots (id, user_id, device_id, revision, format, iv, ciphertext, sha256, size_bytes)
  values (p_snapshot_id, v_uid, p_device_id, p_revision, p_format, p_iv, p_ciphertext, p_sha256,
    (char_length(p_ciphertext) * 3) / 4)
  returning created_at into v_created;

  update public.backup_devices
  set head_revision = p_revision, head_snapshot_id = p_snapshot_id, updated_at = now()
  where id = p_device_id;

  -- Retention: keep the newest 10 snapshots plus the newest of each day for 30 days.
  delete from public.backup_snapshots s
  where s.device_id = p_device_id
    and s.id not in (
      select id from (
        select id from public.backup_snapshots where device_id = p_device_id
        order by revision desc limit 10
      ) newest
      union
      select id from (
        select distinct on (date_trunc('day', created_at)) id
        from public.backup_snapshots
        where device_id = p_device_id and created_at > now() - interval '30 days'
        order by date_trunc('day', created_at), revision desc
      ) daily
    );

  return jsonb_build_object('status', 'ok', 'revision', p_revision, 'createdAt', v_created,
    'headRevision', p_revision);
end;
$$;

-- Turning cloud backup off with "delete cloud copies": removes every device, snapshot, and the wrapped key.
create or replace function public.delete_my_backups() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.backup_devices where user_id = auth.uid();
  delete from public.backup_keys where user_id = auth.uid();
end;
$$;

revoke all on function public.commit_backup(uuid, uuid, bigint, smallint, text, text, text) from public, anon;
revoke all on function public.delete_my_backups() from public, anon;
grant execute on function public.commit_backup(uuid, uuid, bigint, smallint, text, text, text) to authenticated;
grant execute on function public.delete_my_backups() to authenticated;
