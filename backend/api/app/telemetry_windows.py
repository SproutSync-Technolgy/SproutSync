"""Bounded, restart-safe minute accumulators and fault-aware five-minute rollups.

Sums/counts are merged, never averages of averages. Missing/faulty measurements
have no weight. No gap filling, old-history deletion, or hardware control occurs.
"""

from copy import deepcopy
from datetime import UTC, datetime

MINUTE_SECONDS = 60
NORMAL_SECONDS = 300
METRICS = (
    "temperature_c",
    "humidity_percent",
    "water_temperature_c",
    "light_lux",
    "water_level_percent",
    "wastewater_level_percent",
    "voltage",
)
HEALTHY = {"NONE", "OK", "NORMAL"}


def signature(reading):
    status = reading.get("sensor_status", "NONE")
    return (
        status if status not in HEALTHY else "HEALTHY",
        reading.get("sd_ok") is False,
    )


def _bin(start):
    return {
        "start": start,
        "count": 0,
        "faults": 0,
        "metrics": {},
        "sd_ok": None,
        "last_status": "NONE",
        "last_received": None,
        "emitted": False,
    }


def _summary(bins, start, end, aggregation):
    metrics = {}
    for name in METRICS:
        parts = [
            item["metrics"][name]
            for item in bins
            if item["metrics"].get(name, {}).get("count", 0)
        ]
        count = sum(part["count"] for part in parts)
        metrics[name] = {
            "count": count,
            "sum": sum(part["sum"] for part in parts),
            "min": min((part["min"] for part in parts), default=None),
            "max": max((part["max"] for part in parts), default=None),
        }
    latest = max(bins, key=lambda item: item["last_received"])
    sd_values = [item["sd_ok"] for item in bins if item["sd_ok"] is not None]
    return {
        **{
            name: stats["sum"] / stats["count"] if stats["count"] else None
            for name, stats in metrics.items()
        },
        "metric_counts": {name: stats["count"] for name, stats in metrics.items()},
        "metric_stats": metrics,
        "sample_count": sum(item["count"] for item in bins),
        "fault_count": sum(item["faults"] for item in bins),
        "sensor_status": latest["last_status"],
        "sd_ok": all(sd_values) if sd_values else None,
        "recorded_at": datetime.fromtimestamp(start, UTC).isoformat(),
        "received_at": latest["last_received"],
        "window_started_at": datetime.fromtimestamp(start, UTC).isoformat(),
        "window_ended_at": datetime.fromtimestamp(end, UTC).isoformat(),
        "aggregation": aggregation,
    }


def _flush(window, now, *, close=False):
    if not window or window.get("closed"):
        return []
    bins = list(window["bins"].values())
    if not bins:
        return []
    end = window["start"] + NORMAL_SECONDS
    if window["fault_seen"]:
        rows = []
        for item in bins:
            if not item["emitted"] and (close or item["start"] + MINUTE_SECONDS <= now):
                rows.append(
                    _summary(
                        [item], item["start"], item["start"] + MINUTE_SECONDS, "minute"
                    )
                )
                item["emitted"] = True
        if close or now >= end:
            window["closed"] = True
        return rows
    if close or now >= end:
        window["closed"] = True
        return [_summary(bins, window["start"], end, "five_min")]
    return []


def flush_due(state, now):
    result = deepcopy(state or {})
    rows = _flush(result.get("window"), now.timestamp())
    return result, rows


def next_flush_time(state):
    window = (state or {}).get("window")
    if not window or window.get("closed"):
        return None
    deadline = window["start"] + NORMAL_SECONDS
    if window["fault_seen"]:
        deadline = min(
            [deadline]
            + [
                item["start"] + MINUTE_SECONDS
                for item in window["bins"].values()
                if not item["emitted"]
            ]
        )
    return datetime.fromtimestamp(deadline, UTC)


def accumulate(state, reading, message_id=None):
    """Return new private state, completed averages, minute preview and transition."""
    result = deepcopy(state or {})
    now = datetime.fromisoformat(reading["received_at"]).timestamp()
    start = int(now // NORMAL_SECONDS) * NORMAL_SECONDS
    window = result.get("window")
    rows = []
    if window and window["start"] != start:
        rows.extend(_flush(window, now, close=True))
        window = None
    if window is None:
        window = {"start": start, "bins": {}, "fault_seen": False, "closed": False}
        result["window"] = window
    fault = reading["sensor_status"] not in HEALTHY or reading.get("sd_ok") is False
    window["fault_seen"] |= fault
    rows.extend(_flush(window, now))
    minute = int(now // MINUTE_SECONDS) * MINUTE_SECONDS
    item = window["bins"].setdefault(str(minute), _bin(minute))
    item["count"] += 1
    item["faults"] += int(fault)
    item["last_status"] = reading["sensor_status"]
    item["last_received"] = reading["received_at"]
    if reading.get("sd_ok") is not None:
        item["sd_ok"] = (
            reading["sd_ok"]
            if item["sd_ok"] is None
            else item["sd_ok"] and reading["sd_ok"]
        )
    for name in METRICS:
        value = reading.get(name)
        if value is None:
            continue
        metric = item["metrics"].setdefault(
            name, {"count": 0, "sum": 0.0, "min": value, "max": value}
        )
        metric["count"] += 1
        metric["sum"] += value
        metric["min"] = min(metric["min"], value)
        metric["max"] = max(metric["max"], value)
    previous = result.get("signature")
    current = list(signature(reading))
    transition = previous is None or previous != current
    result["signature"] = current
    recent = result.setdefault("message_ids", [])
    if message_id:
        result["message_ids"] = (recent + [message_id])[-128:]
    preview = _summary([item], minute, minute + MINUTE_SECONDS, "minute")
    preview["provisional"] = True
    return result, rows, preview, transition
