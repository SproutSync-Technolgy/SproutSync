"""One permission-preserving search contract for web and field clients."""

from alembic import op

revision = "0020_workspace_search"
down_revision = "0019_field_workflows"
branch_labels = None
depends_on = None

# Every source is fixed application SQL. Search text is a PL/pgSQL value, never
# interpolated SQL. SECURITY INVOKER preserves each table's existing RLS policy.
SOURCES = [
    (
        "batch",
        "batches",
        "b.code",
        "concat_ws(' · ', b.seed_type, b.stage, b.status)",
        "concat_ws(' ', b.code, b.seed_type, b.stage, b.status, b.notes)",
        "production",
        "b.started_at",
        "true",
    ),
    (
        "device",
        "devices",
        "b.name",
        "concat_ws(' · ', b.serial_number, b.status)",
        "concat_ws(' ', b.name, b.serial_number, b.status, b.mqtt_topic_prefix)",
        "readings",
        "b.created_at",
        "true",
    ),
    (
        "alert",
        "alerts",
        "b.title",
        "concat_ws(' · ', b.severity, b.status, left(b.message, 100))",
        "concat_ws(' ', b.title, b.message, b.recommended_action, b.status, b.severity)",
        "alerts",
        "b.created_at",
        "true",
    ),
    (
        "evidence",
        "evidence_records",
        "b.title",
        "concat_ws(' · ', b.category, b.result)",
        "concat_ws(' ', b.title, b.category, b.result, b.notes)",
        "evidence",
        "b.recorded_at",
        "true",
    ),
    (
        "maintenance",
        "maintenance_records",
        "'Maintenance · ' || d.name",
        "left(b.notes, 150)",
        "concat_ws(' ', 'maintenance', b.notes, d.name, d.serial_number)",
        "system",
        "b.performed_at",
        "true",
    ),
    (
        "schedule",
        "irrigation_schedules",
        "'Irrigation plan · ' || d.name",
        "concat_ws(' · ', b.next_run_at::text, b.duration_seconds::text || ' seconds')",
        "concat_ws(' ', 'irrigation schedule plan', d.name, d.serial_number, b.next_run_at::text)",
        "irrigation",
        "b.next_run_at",
        "true",
    ),
    (
        "watering",
        "watering_events",
        "'Watering · ' || d.name",
        "concat_ws(' · ', b.volume_ml::text || ' ml', b.occurred_at::text)",
        "concat_ws(' ', 'watering water irrigation', d.name, d.serial_number, b.occurred_at::text)",
        "irrigation",
        "b.occurred_at",
        "true",
    ),
    (
        "evaluation",
        "evaluations",
        "'Assessment · ' || c.code",
        "concat_ws(' · ', b.rating::text || '/5', left(b.comments, 100))",
        "concat_ws(' ', 'evaluation assessment rating', c.code, b.comments)",
        "production",
        "b.created_at",
        "true",
    ),
    (
        "activity",
        "activity_logs",
        "b.action",
        "b.resource",
        "concat_ws(' ', b.action, b.resource, b.created_at::text)",
        "audit",
        "b.created_at",
        "public.is_superadmin()",
    ),
    (
        "access",
        "evaluator_access",
        "b.evaluator_email",
        "'Evaluator access'",
        "concat_ws(' ', 'evaluator access', b.evaluator_email)",
        "system",
        "b.created_at",
        "true",
    ),
]


def upgrade() -> None:
    sources = []
    for (
        kind,
        table,
        title,
        subtitle,
        searchable,
        destination,
        timestamp,
        allowed,
    ) in SOURCES:
        join = ""
        if kind in ("maintenance", "schedule", "watering"):
            join = "join public.devices d on d.id=b.device_id and d.owner_id=b.owner_id"
        elif kind == "evaluation":
            join = "join public.batches c on c.id=b.batch_id"
        sources.append(f"""(
          select '{kind}'::text as kind, b.id::bigint as record_id,
            ({title})::text as title, ({subtitle})::text as subtitle,
            '{destination}'::text as destination, to_jsonb(b) as payload
          from public.{table} b {join}
          where ({allowed}) and strpos(lower({searchable}), term)>0
          order by case when lower({title})=term then 0 else 1 end,
            {timestamp} desc, b.id desc limit 5
        )""")
    union = "\nunion all\n".join(sources)
    op.execute(f"""
      create function public.search_workspace(query_text text)
      returns table(kind text, record_id bigint, title text, subtitle text,
        destination text, payload jsonb)
      language plpgsql stable security invoker set search_path = '' as $$
      declare term text := lower(trim(query_text));
      begin
        if term is null or length(term)<2 then return; end if;
        if length(term)>100 then raise exception 'Search must be 100 characters or fewer.' using errcode='22023'; end if;
        if not exists(select 1 from public.users u
          where u.id=public.current_profile_id() and u.is_active
            and u.role in ('operator','evaluator','admin','superadmin')) then
          return;
        end if;
        return query with matches as ({union})
        select m.kind, m.record_id, m.title, m.subtitle, m.destination, m.payload
        from matches m
        order by case when lower(m.title)=term then 0 else 1 end,
          m.kind, m.title, m.record_id limit 40;
      end $$;
      revoke all on function public.search_workspace(text) from public, anon;
      grant execute on function public.search_workspace(text) to authenticated;
      NOTIFY pgrst, 'reload schema';
    """)


def downgrade() -> None:
    op.execute("drop function public.search_workspace(text)")
    op.execute("NOTIFY pgrst, 'reload schema'")
