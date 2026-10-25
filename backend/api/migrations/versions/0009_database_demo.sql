do $$ declare tbl text; begin
  foreach tbl in array array['devices','trays','batches','telemetry_readings','irrigation_schedules','watering_events','alerts','evidence_records','maintenance_records','activity_logs'] loop
    execute format('alter table public.%I add column is_demo boolean not null default false',tbl);
  end loop;
end $$;
alter table public.telemetry_readings add column water_temperature_c double precision;
alter table public.telemetry_readings add column light_lux double precision check(light_lux>=0);
alter table public.telemetry_readings add column wastewater_level_percent double precision check(wastewater_level_percent between 0 and 100);

create function public.seed_demo_records(target integer) returns void
language plpgsql security definer set search_path = '' as $$
declare chamber bigint; tray_ids bigint[]='{}'; batch_ids integer[]='{}'; new_id bigint; item integer; weights double precision[]=array[4.1,4.4,4.0,4.6,4.3,4.5,4.2];
begin
  perform pg_catalog.pg_advisory_xact_lock(target::bigint);
  if exists(select 1 from public.batches where owner_id=target) then return; end if;
  insert into public.devices(owner_id,name,serial_number,status,last_seen_at,is_demo)
    values(target,'ESP32 chamber controller','SAMPLE-'||target||'-CHAMBER','online',now(),true) returning id into chamber;
  for item in 1..3 loop
    insert into public.trays(owner_id,device_id,position,status,is_demo) values(target,chamber,item,'active',true) returning id into new_id;
    tray_ids:=array_append(tray_ids,new_id);
  end loop;
  insert into public.batches(owner_id,code,seed_type,stage,status,started_at,target_harvest_at,notes,tray_id,is_demo)
    values(target,'MB-2409','Mung beans','growing','active',now()-interval '2 days',now()+interval '2 days','Sample: sprouts growing on schedule.',tray_ids[1],true) returning id into new_id;
  batch_ids:=array_append(batch_ids,new_id::integer);
  insert into public.batches(owner_id,code,seed_type,stage,status,started_at,target_harvest_at,notes,tray_id,is_demo)
    values(target,'MB-2408','Mung beans','ready','active',now()-interval '4 days',now(),'Sample: operator inspection and harvest entry required.',tray_ids[2],true) returning id into new_id;
  batch_ids:=array_append(batch_ids,new_id::integer);
  insert into public.batches(owner_id,code,seed_type,stage,status,started_at,target_harvest_at,notes,tray_id,is_demo)
    values(target,'MB-2410','Mung beans','soaking','active',now(),now()+interval '4 days','Sample: seeds soaking; first rinse in two hours.',tray_ids[3],true) returning id into new_id;
  batch_ids:=array_append(batch_ids,new_id::integer);
  insert into public.devices(owner_id,name,serial_number,status,last_seen_at,is_demo)
    select target,n.name,'SAMPLE-'||target||'-'||n.suffix,n.status,now(),true from (values
      ('Air-temperature sensor','TEMP','online'),('Humidity sensor','RH','online'),('Water-temperature sensor','WTEMP','online'),
      ('Light sensor','LIGHT','online'),('Fresh-water level sensor','FRESH','online'),('Wastewater level sensor','WASTE','online'),
      ('Delivery pump','PUMP','online'),('Tray 2 valve','VALVE2','fault'),('Tray valve controller','VALVES','online')) n(name,suffix,status);
  insert into public.telemetry_readings(owner_id,device_id,temperature_c,humidity_percent,water_level_percent,water_temperature_c,light_lux,wastewater_level_percent,recorded_at,is_demo)
    select target,chamber,24.6,88,34,20.4,0.3,38,now()-(i*interval '1 hour'),true from generate_series(0,6) i;
  insert into public.irrigation_schedules(owner_id,device_id,next_run_at,duration_seconds,is_demo) values(target,chamber,now()+interval '2 hours',120,true);
  for item in 1..7 loop
    insert into public.watering_events(owner_id,batch_id,device_id,volume_ml,duration_seconds,occurred_at,is_demo)
      values(target,batch_ids[1],chamber,weights[item]*1000,120,now()-((7-item)*interval '1 day'),true);
  end loop;
  insert into public.alerts(owner_id,device_id,title,message,recommended_action,severity,category,created_at,is_demo) values
    (target,chamber,'Fresh-water tank low','Level at 34% — refill recommended.','Top up the fresh-water tank so scheduled rinses can continue.','warning','system',now()-interval '8 minutes',true),
    (target,chamber,'Batch MB-2408 inspection due','Scheduled growing duration nearly elapsed.','Inspect the batch and record the outcome.','info','harvest',now()-interval '1 hour',true),
    (target,chamber,'Tray 2 valve not responding','No response from the Tray 2 valve.','Check the valve and wiring, then record a maintenance note.','critical','system',now()-interval '3 hours',true);
  insert into public.evidence_records(owner_id,batch_id,category,title,result,notes,is_demo) values
    (target,batch_ids[1],'calibration','Sensor calibration','pending','Sample planned check. No real calibration has been performed.',true),
    (target,batch_ids[1],'irrigation','Tray-sequence watering','pending','Sample planned check: verify each tray is watered in order.',true),
    (target,batch_ids[1],'safety','Low-water interlock','pending','Sample planned check: verify watering pauses below the threshold.',true),
    (target,batch_ids[1],'offline_sync','Offline record recovery','pending','Sample planned check: disconnect and reconnect the controller.',true);
  insert into public.maintenance_records(owner_id,device_id,notes,performed_at,is_demo) values(target,chamber,'Sample: pump inspection recorded.',now()-interval '1 day',true);
  update public.activity_logs set is_demo=true where owner_id=target and resource like 'batches:%';
end $$;
revoke all on function public.seed_demo_records(integer) from public,anon,authenticated;

insert into public.users(google_subject,email,display_name,role,is_active,profile_complete)
values('sproutsync-demo-workspace','demo@sproutsync.invalid','SproutSync sample workspace','operator',false,true);
do $$ declare owner_record record; begin
  for owner_record in select id from public.users where role in ('operator','admin') loop
    perform public.seed_demo_records(owner_record.id);
  end loop;
end $$;

create or replace function public.can_view_owner(target integer) returns boolean
language sql stable security definer set search_path = '' as $$
 select target=public.current_profile_id()
 or exists(select 1 from public.evaluator_access a join public.users u on lower(u.email)=a.evaluator_email
   where a.owner_id=target and u.id=public.current_profile_id() and u.role='evaluator')
 or (
   public.current_profile_id() is not null
   and target=(select id from public.users where google_subject='sproutsync-demo-workspace')
   and not exists(select 1 from public.batches b where b.owner_id=public.current_profile_id()
      or b.owner_id in(select a.owner_id from public.evaluator_access a join public.users u on lower(u.email)=a.evaluator_email where u.id=public.current_profile_id()))
 )
$$;
-- Copy samples to newly assigned operators on their next verified login.
create function public.initialize_workspace() returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.is_operator() then perform public.seed_demo_records(public.current_profile_id()); end if;
end $$;
revoke all on function public.initialize_workspace() from public,anon;
grant execute on function public.initialize_workspace() to authenticated;
notify pgrst, 'reload schema';
