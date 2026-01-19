"""Quick check using saved tokens - zero spoons required"""
from garminconnect import Garmin
from pathlib import Path
from datetime import date

client = Garmin()
client.login(str(Path.home() / ".garminconnect"))

today = date.today().strftime("%Y-%m-%d")

hr = client.get_heart_rates(today)
stress = client.get_all_day_stress(today)
bb = client.get_body_battery(today, today)
day = bb[0] if bb and len(bb) > 0 else {}

print(f"HR: {hr.get('restingHeartRate', 'N/A')} bpm")
print(f"Stress: {stress.get('avgStressLevel', 'N/A')} avg, {stress.get('maxStressLevel', 'N/A')} max")
print(f"Body Battery: +{day.get('charged', '?')} / -{day.get('drained', '?')}")
