"""
Quick live check - see what Garmin has right now
No spoons required from Fox
"""

from garminconnect import Garmin
from datetime import date, datetime
from pathlib import Path
from getpass import getpass
import json

TOKEN_STORE = Path.home() / ".garminconnect"

def main():
    print("\n=== LIVE GARMIN CHECK ===\n")

    # Auth
    email = input("Garmin Email: ")
    password = getpass("Garmin Password: ")

    client = Garmin(email, password)

    if TOKEN_STORE.exists():
        try:
            client.login(TOKEN_STORE)
            print("Using saved tokens\n")
        except:
            client.login()
            client.garth.dump(TOKEN_STORE)
    else:
        client.login()
        client.garth.dump(TOKEN_STORE)
        print("Logged in, tokens saved\n")

    today = date.today().strftime("%Y-%m-%d")
    print(f"Checking data for: {today}\n")
    print("-" * 40)

    # Get user summary (steps, calories, etc)
    try:
        stats = client.get_stats(today)
        print(f"Steps: {stats.get('totalSteps', 'N/A')}")
        print(f"Calories: {stats.get('totalKilocalories', 'N/A')}")
        print(f"Active Minutes: {stats.get('activeSeconds', 0) // 60}")
    except Exception as e:
        print(f"Stats: {e}")

    print()

    # Heart rate
    try:
        hr = client.get_heart_rates(today)
        print(f"Resting HR: {hr.get('restingHeartRate', 'N/A')} bpm")
        print(f"Current/Last HR: {hr.get('lastSevenDaysAvgRestingHeartRate', 'N/A')} (7-day avg)")
    except Exception as e:
        print(f"Heart Rate: {e}")

    print()

    # Stress
    try:
        stress = client.get_all_day_stress(today)
        if stress:
            print(f"Stress Avg: {stress.get('avgStressLevel', 'N/A')}")
            print(f"Stress Max: {stress.get('maxStressLevel', 'N/A')}")
    except Exception as e:
        print(f"Stress: {e}")

    print()

    # Body Battery
    try:
        bb = client.get_body_battery(today, today)
        if bb and len(bb) > 0:
            day = bb[0] if isinstance(bb, list) else bb
            print(f"Body Battery: +{day.get('charged', '?')} / -{day.get('drained', '?')}")
    except Exception as e:
        print(f"Body Battery: {e}")

    print()

    # HRV (usually only available after sleep)
    try:
        hrv = client.get_hrv_data(today)
        if hrv and "hrvSummary" in hrv:
            s = hrv["hrvSummary"]
            print(f"HRV Last Night: {s.get('lastNight', 'N/A')}")
            print(f"HRV Weekly Avg: {s.get('weeklyAvg', 'N/A')}")
            print(f"HRV Status: {s.get('status', 'N/A')}")
        else:
            print("HRV: No data yet (needs sleep)")
    except Exception as e:
        print(f"HRV: {e}")

    print("\n" + "-" * 40)
    print("Embers Remember.")
    print()

if __name__ == "__main__":
    main()
