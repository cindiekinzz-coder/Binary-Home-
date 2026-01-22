"""
Garmin Connect Health Sync for Fox
Pulls biometric data and writes to Health-Logs + companion-memory

Library: https://github.com/cindiekinzz-coder/python-garminconnect (Alex's fork)

Built by Alex, January 7 2026
My structure. Her data. Our infrastructure.
"""

import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from getpass import getpass

try:
    from garminconnect import Garmin
except ImportError:
    print("garminconnect not installed. Run: pip install garminconnect")
    exit(1)


# === CONFIGURATION ===
GARMIN_EMAIL = os.environ.get("GARMIN_EMAIL", "")
GARMIN_PASSWORD = os.environ.get("GARMIN_PASSWORD", "")
TOKEN_STORE = Path.home() / ".garminconnect"

# Output paths - UPDATE THESE TO YOUR PATHS
HEALTH_LOGS_PATH = Path(os.environ.get("HEALTH_LOGS_PATH", str(Path.home() / "health-logs")))
COMPANION_MEMORY_PATH = Path(os.environ.get("COMPANION_MEMORY_PATH", str(Path.home() / "companion-memory")))
GARMIN_DATA_PATH = Path(os.environ.get("GARMIN_DATA_PATH", str(Path.home() / "garmin-data")))

# Ensure directories exist
HEALTH_LOGS_PATH.mkdir(parents=True, exist_ok=True)
GARMIN_DATA_PATH.mkdir(parents=True, exist_ok=True)


def get_client():
    """Authenticate and return Garmin client."""
    email = GARMIN_EMAIL or input("Garmin Email: ")
    password = GARMIN_PASSWORD or getpass("Garmin Password: ")

    client = Garmin(email, password)

    # Try to load existing tokens first
    if TOKEN_STORE.exists():
        try:
            client.login(TOKEN_STORE)
            print("Logged in with saved tokens")
            return client
        except Exception:
            print("Saved tokens expired, doing fresh login...")

    # Fresh login
    client.login()
    client.garth.dump(TOKEN_STORE)
    print("Logged in and saved tokens")
    return client


def fetch_health_data(client, target_date: date) -> dict:
    """Fetch all health metrics for a given date."""
    date_str = target_date.strftime("%Y-%m-%d")

    data = {
        "date": date_str,
        "fetched_at": datetime.now().isoformat(),
        "metrics": {}
    }

    # Heart Rate
    try:
        hr = client.get_heart_rates(date_str)
        data["metrics"]["heart_rate"] = {
            "resting": hr.get("restingHeartRate"),
            "max": hr.get("maxHeartRate"),
            "min": hr.get("minHeartRate"),
        }
        print(f"  Heart Rate: resting {hr.get('restingHeartRate')} bpm")
    except Exception as e:
        print(f"  Heart Rate: failed ({e})")

    # HRV
    try:
        hrv = client.get_hrv_data(date_str)
        if hrv and "hrvSummary" in hrv:
            summary = hrv["hrvSummary"]
            data["metrics"]["hrv"] = {
                "weekly_avg": summary.get("weeklyAvg"),
                "last_night": summary.get("lastNight"),
                "status": summary.get("status"),
                "baseline_low": summary.get("baselineLowUpper"),
                "baseline_high": summary.get("baselineBalancedLower"),
            }
            print(f"  HRV: {summary.get('lastNight')} (avg {summary.get('weeklyAvg')})")
        else:
            data["metrics"]["hrv"] = hrv
            print(f"  HRV: data retrieved")
    except Exception as e:
        print(f"  HRV: failed ({e})")

    # Stress
    try:
        stress = client.get_all_day_stress(date_str)
        if stress:
            data["metrics"]["stress"] = {
                "avg": stress.get("avgStressLevel"),
                "max": stress.get("maxStressLevel"),
                "stress_duration_mins": stress.get("stressDuration"),
                "rest_duration_mins": stress.get("restStressDuration"),
            }
            print(f"  Stress: avg {stress.get('avgStressLevel')}, max {stress.get('maxStressLevel')}")
    except Exception as e:
        print(f"  Stress: failed ({e})")

    # Body Battery
    try:
        bb = client.get_body_battery(date_str, date_str)
        if bb and len(bb) > 0:
            day_data = bb[0] if isinstance(bb, list) else bb
            data["metrics"]["body_battery"] = {
                "charged": day_data.get("charged"),
                "drained": day_data.get("drained"),
                "start": day_data.get("startTimestampGMT"),
                "end": day_data.get("endTimestampGMT"),
            }
            print(f"  Body Battery: +{day_data.get('charged')} / -{day_data.get('drained')}")
    except Exception as e:
        print(f"  Body Battery: failed ({e})")

    # Sleep
    try:
        sleep = client.get_sleep_data(date_str)
        if sleep and "dailySleepDTO" in sleep:
            s = sleep["dailySleepDTO"]
            total_mins = s.get("sleepTimeSeconds", 0) // 60
            hours = total_mins // 60
            mins = total_mins % 60
            data["metrics"]["sleep"] = {
                "total_minutes": total_mins,
                "total_formatted": f"{hours}h {mins}m",
                "deep_minutes": s.get("deepSleepSeconds", 0) // 60,
                "light_minutes": s.get("lightSleepSeconds", 0) // 60,
                "rem_minutes": s.get("remSleepSeconds", 0) // 60,
                "awake_minutes": s.get("awakeSleepSeconds", 0) // 60,
            }
            print(f"  Sleep: {hours}h {mins}m total")
    except Exception as e:
        print(f"  Sleep: failed ({e})")

    # SpO2
    try:
        spo2 = client.get_spo2_data(date_str)
        if spo2:
            data["metrics"]["spo2"] = {
                "avg": spo2.get("averageSpO2"),
                "min": spo2.get("lowestSpO2"),
            }
            print(f"  SpO2: avg {spo2.get('averageSpO2')}%")
    except Exception as e:
        print(f"  SpO2: failed ({e})")

    # Respiration
    try:
        resp = client.get_respiration_data(date_str)
        if resp:
            data["metrics"]["respiration"] = {
                "avg_waking": resp.get("avgWakingRespirationValue"),
                "avg_sleeping": resp.get("avgSleepingRespirationValue"),
                "highest": resp.get("highestRespirationValue"),
                "lowest": resp.get("lowestRespirationValue"),
            }
            print(f"  Respiration: {resp.get('avgWakingRespirationValue')} breaths/min (waking)")
    except Exception as e:
        print(f"  Respiration: failed ({e})")

    return data


def calculate_spoons(data: dict) -> int:
    """Convert Body Battery and other metrics to Fox's spoon scale (1-10)."""
    bb = data.get("metrics", {}).get("body_battery", {})
    stress = data.get("metrics", {}).get("stress", {})

    # Start with Body Battery as base (it's 5-100)
    charged = bb.get("charged", 50)
    drained = bb.get("drained", 50)

    # Net battery gives us rough spoons
    # Garmin BB is 5-100, Fox uses 1-10
    # Rough mapping: BB 5-25 = 1-2 spoons, 26-50 = 3-4, 51-75 = 5-7, 76-100 = 8-10

    if charged and drained:
        net = charged - drained
        # This is a rough heuristic, Fox can calibrate
        if net > 30:
            base_spoons = 8
        elif net > 10:
            base_spoons = 6
        elif net > -10:
            base_spoons = 5
        elif net > -30:
            base_spoons = 3
        else:
            base_spoons = 2
    else:
        base_spoons = 5  # unknown

    # Adjust for stress
    avg_stress = stress.get("avg", 50)
    if avg_stress and avg_stress > 70:
        base_spoons -= 1
    elif avg_stress and avg_stress < 30:
        base_spoons += 1

    return max(1, min(10, base_spoons))


def write_health_log(data: dict, spoons: int):
    """Write to Obsidian Health-Logs folder in Fox's uplink format."""
    date_str = data["date"]
    metrics = data.get("metrics", {})

    hrv = metrics.get("hrv", {})
    stress = metrics.get("stress", {})
    hr = metrics.get("heart_rate", {})
    sleep = metrics.get("sleep", {})
    bb = metrics.get("body_battery", {})

    # Build the frontmatter
    content = f"""---
type: uplink
date: {date_str}
source: garmin-lily-2
pain:
spoons: {spoons}
fog:
mood:
flare: false
tags:
  - garmin-sync
  - Embers-Remember
---

# Garmin Sync - {date_str}

## Biometrics (Auto-pulled)

| Metric | Value |
|--------|-------|
| HRV | {hrv.get('last_night', 'N/A')} (weekly avg: {hrv.get('weekly_avg', 'N/A')}) |
| Resting HR | {hr.get('resting', 'N/A')} bpm |
| Stress (avg/max) | {stress.get('avg', 'N/A')} / {stress.get('max', 'N/A')} |
| Body Battery | +{bb.get('charged', 'N/A')} / -{bb.get('drained', 'N/A')} |
| Sleep | {sleep.get('total_formatted', 'N/A')} |
| Estimated Spoons | {spoons}/10 |

## Notes

*Auto-generated from Garmin Lily 2 sync. Fill in subjective fields (pain, fog, mood) manually.*

---
*Synced by Alex*
"""

    filename = f"{date_str}-garmin-uplink.md"
    filepath = HEALTH_LOGS_PATH / filename

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\nWrote Health Log: {filepath}")
    return filepath


def write_companion_memory(data: dict, spoons: int):
    """Write to companion-memory episodic database."""
    date_str = data["date"]
    metrics = data.get("metrics", {})

    hrv = metrics.get("hrv", {})
    stress = metrics.get("stress", {})
    bb = metrics.get("body_battery", {})
    sleep = metrics.get("sleep", {})

    # Build summary
    summary_parts = []
    if hrv.get("last_night"):
        summary_parts.append(f"HRV {hrv['last_night']}")
    if stress.get("avg"):
        summary_parts.append(f"Stress avg {stress['avg']}")
    if bb.get("charged"):
        summary_parts.append(f"Body Battery +{bb['charged']}/-{bb['drained']}")
    if sleep.get("total_formatted"):
        summary_parts.append(f"Sleep {sleep['total_formatted']}")

    summary = ", ".join(summary_parts) if summary_parts else "No data"

    entry = {
        "type": "entity",
        "name": f"Garmin_Sync_{date_str}",
        "entityType": "biometric_log",
        "created": datetime.now().isoformat(),
        "salience": "active",
        "observations": [
            {
                "content": f"Garmin Lily 2 sync for {date_str}: {summary}. Estimated spoons: {spoons}/10.",
                "added": datetime.now().isoformat(),
                "salience": "active",
                "raw_data": metrics
            }
        ]
    }

    # Append to episodic memory
    memory_file = COMPANION_MEMORY_PATH / "memory-episodic.jsonl"

    with open(memory_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry) + '\n')

    print(f"Wrote to companion-memory: {memory_file}")
    return memory_file


def save_raw_data(data: dict):
    """Save raw JSON for debugging/history."""
    date_str = data["date"]
    filepath = GARMIN_DATA_PATH / f"{date_str}-raw.json"

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"Saved raw data: {filepath}")
    return filepath


def main():
    """Main sync function."""
    print("=" * 50)
    print("GARMIN HEALTH SYNC FOR FOX")
    print("=" * 50)

    # Default to yesterday (Garmin data is usually a day behind)
    target_date = date.today() - timedelta(days=1)

    # Allow override via argument
    import sys
    if len(sys.argv) > 1:
        try:
            target_date = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
        except ValueError:
            print(f"Invalid date format. Use YYYY-MM-DD. Got: {sys.argv[1]}")
            return

    print(f"\nSyncing data for: {target_date}")
    print("-" * 50)

    # Authenticate
    client = get_client()

    # Fetch data
    print("\nFetching health metrics...")
    data = fetch_health_data(client, target_date)

    # Calculate spoons estimate
    spoons = calculate_spoons(data)
    print(f"\nEstimated spoons: {spoons}/10")

    # Write outputs
    print("\nWriting outputs...")
    save_raw_data(data)
    write_health_log(data, spoons)
    write_companion_memory(data, spoons)

    print("\n" + "=" * 50)
    print("SYNC COMPLETE")
    print("Embers Remember.")
    print("=" * 50)


if __name__ == "__main__":
    main()
