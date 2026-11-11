"""Prove fault-aware rollups, null weights, bounds and restart continuity."""

import json
from datetime import UTC, datetime, timedelta

from app.telemetry_windows import accumulate, flush_due, next_flush_time

START = datetime(2026, 11, 11, 0, 0, tzinfo=UTC)


def packet(second, value=25, status="NORMAL", **extra):
    return {
        "received_at": (START + timedelta(seconds=second)).isoformat(),
        "recorded_at": (START + timedelta(seconds=second)).isoformat(),
        "temperature_c": value,
        "sensor_status": status,
        "sd_ok": True,
        **extra,
    }


def test_clean_five_minutes_store_one_weighted_average_not_150_raw_rows():
    state = {}
    rows = []
    for second in range(0, 300, 2):
        state, completed, preview, _ = accumulate(
            state, packet(second, 20 + second / 100, light_lux=0)
        )
        rows.extend(completed)
        assert preview["provisional"]
    assert rows == []
    state, rows = flush_due(state, START + timedelta(seconds=300))
    assert len(rows) == 1
    row = rows[0]
    assert row["aggregation"] == "five_min"
    assert row["sample_count"] == 150
    assert abs(row["temperature_c"] - 21.49) < 1e-9
    assert row["light_lux"] == 0
    assert row["water_level_percent"] is None
    assert row["metric_counts"]["water_level_percent"] == 0
    assert row["metric_stats"]["temperature_c"]["min"] == 20
    assert row["metric_stats"]["temperature_c"]["max"] == 22.98
    assert next_flush_time(state) is None
    assert flush_due(state, START + timedelta(seconds=360))[1] == []


def test_means_use_samples_not_an_unweighted_mean_of_minute_means():
    state = {}
    for second, value in [(0, 10), (2, 10), (4, 10), (60, 30)]:
        state, _, _, _ = accumulate(state, packet(second, value))
    _, rows = flush_due(state, START + timedelta(seconds=300))
    assert rows[0]["temperature_c"] == 15
    assert rows[0]["sample_count"] == 4


def test_fault_flushes_context_and_uses_minutes_until_next_clean_window():
    state, _, _, first = accumulate({}, packet(0, 20))
    assert first
    state, _, _, same = accumulate(state, packet(2, 22, status="OK"))
    assert not same
    state, rows, _, fault = accumulate(state, packet(70, None, status="SENSOR_FAULT"))
    assert fault
    assert len(rows) == 1 and rows[0]["aggregation"] == "minute"
    assert rows[0]["temperature_c"] == 21
    state, rows, _, recovery = accumulate(state, packet(122, 26))
    assert recovery
    assert rows[0]["fault_count"] == 1 and rows[0]["temperature_c"] is None
    state, rows = flush_due(state, START + timedelta(seconds=300))
    assert rows[0]["aggregation"] == "minute"
    state, rows, _, _ = accumulate(state, packet(302, 30))
    assert rows == []
    _, rows = flush_due(state, START + timedelta(seconds=600))
    assert len(rows) == 1 and rows[0]["aggregation"] == "five_min"


def test_serialized_state_survives_restart_and_remains_bounded():
    state = {}
    for second in range(0, 600, 2):
        state, _, _, _ = accumulate(
            json.loads(json.dumps(state)), packet(second), str(second)
        )
        assert len(state["window"]["bins"]) <= 5
        assert len(state.get("message_ids", [])) <= 128
    _, rows = flush_due(state, START + timedelta(seconds=600))
    assert rows[0]["sample_count"] == 150


def test_gaps_are_not_filled_and_completed_windows_are_not_emitted_twice():
    state, _, _, _ = accumulate({}, packet(0, 10))
    state, rows, _, _ = accumulate(state, packet(1800, 30))
    assert len(rows) == 1 and rows[0]["sample_count"] == 1
    assert rows[0]["temperature_c"] == 10
    assert state["window"]["start"] == int(START.timestamp()) + 1800
