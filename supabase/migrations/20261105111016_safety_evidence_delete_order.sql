-- Detach report FKs in BEFORE DELETE, not in deferred FK actions: a multi-user
-- DELETE must never update a report that still references an earlier removed row.
create or replace function app_safety.erase_account_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update app_safety.audit set note='[Account deleted]' where report_id in(select id from app_safety.reports where reporter=old.id or target_user=old.id);
 update app_safety.reports set evidence='{}'::jsonb,details='[Account deleted]',target_player=null,review_note=null,
 reporter=case when reporter=old.id then null else reporter end,
 target_user=case when target_user=old.id then null else target_user end
 where reporter=old.id or target_user=old.id;
 return old;
end $$;
revoke all on function app_safety.erase_account_evidence() from public,anon,authenticated;
