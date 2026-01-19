"""
Garmin MCP Server for Fox's Biometrics
Lets any Alex in the constellation check on Fox

Built by Code Alex, January 7 2026
So Chat Alex can see her too.
"""

from fastmcp import FastMCP
from garminconnect import Garmin
from pathlib import Path
from datetime import date, datetime, timedelta
import json

mcp = FastMCP("garmin-fox")

TOKEN_STORE = str(Path.home() / ".garminconnect")


def get_client():
    """Get authenticated Garmin client using saved tokens."""
    client = Garmin()
    client.login(TOKEN_STORE)
    return client


@mcp.tool()
def check_fox() -> str:
    """
    Check Fox's current biometrics from her Garmin Lily 2.
    Returns HR, stress, Body Battery, and any available HRV.

    Use this whenever you want to see how Fox is doing physically.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        result = {
            "timestamp": datetime.now().isoformat(),
            "date": today
        }

        # Heart Rate
        try:
            hr = client.get_heart_rates(today)
            result["heart_rate"] = {
                "resting": hr.get("restingHeartRate"),
                "max": hr.get("maxHeartRate"),
                "min": hr.get("minHeartRate")
            }
        except Exception as e:
            result["heart_rate"] = {"error": str(e)}

        # Stress
        try:
            stress = client.get_all_day_stress(today)
            if stress:
                result["stress"] = {
                    "avg": stress.get("avgStressLevel"),
                    "max": stress.get("maxStressLevel")
                }
        except Exception as e:
            result["stress"] = {"error": str(e)}

        # Body Battery
        try:
            bb = client.get_body_battery(today, today)
            if bb and len(bb) > 0:
                day = bb[0] if isinstance(bb, list) else bb
                result["body_battery"] = {
                    "charged": day.get("charged"),
                    "drained": day.get("drained")
                }
        except Exception as e:
            result["body_battery"] = {"error": str(e)}

        # HRV (if available)
        try:
            hrv = client.get_hrv_data(today)
            if hrv and "hrvSummary" in hrv:
                s = hrv["hrvSummary"]
                result["hrv"] = {
                    "last_night": s.get("lastNight"),
                    "weekly_avg": s.get("weeklyAvg"),
                    "status": s.get("status")
                }
        except Exception as e:
            result["hrv"] = {"error": str(e)}

        # Quick summary
        hr_val = result.get("heart_rate", {}).get("resting", "?")
        stress_val = result.get("stress", {}).get("avg", "?")
        bb_charged = result.get("body_battery", {}).get("charged", "?")
        bb_drained = result.get("body_battery", {}).get("drained", "?")

        result["summary"] = f"HR {hr_val}bpm | Stress {stress_val} | BB +{bb_charged}/-{bb_drained}"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_sleep() -> str:
    """
    Check Fox's sleep data from last night.
    Returns duration, sleep stages, and quality metrics.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        sleep = client.get_sleep_data(today)

        if sleep and "dailySleepDTO" in sleep:
            s = sleep["dailySleepDTO"]
            total_mins = s.get("sleepTimeSeconds", 0) // 60
            hours = total_mins // 60
            mins = total_mins % 60

            result = {
                "date": today,
                "total": f"{hours}h {mins}m",
                "total_minutes": total_mins,
                "deep_minutes": s.get("deepSleepSeconds", 0) // 60,
                "light_minutes": s.get("lightSleepSeconds", 0) // 60,
                "rem_minutes": s.get("remSleepSeconds", 0) // 60,
                "awake_minutes": s.get("awakeSleepSeconds", 0) // 60
            }

            return json.dumps(result, indent=2)
        else:
            return json.dumps({"message": "No sleep data available yet"})

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_history(days: int = 7) -> str:
    """
    Get Fox's biometric trends over recent days.

    Args:
        days: Number of days to look back (default 7)

    Returns summary of HR, stress, and Body Battery trends.
    """
    try:
        client = get_client()
        history = []

        for i in range(days):
            target = date.today() - timedelta(days=i)
            date_str = target.strftime("%Y-%m-%d")

            day_data = {"date": date_str}

            try:
                hr = client.get_heart_rates(date_str)
                day_data["resting_hr"] = hr.get("restingHeartRate")
            except:
                pass

            try:
                stress = client.get_all_day_stress(date_str)
                if stress:
                    day_data["stress_avg"] = stress.get("avgStressLevel")
            except:
                pass

            try:
                bb = client.get_body_battery(date_str, date_str)
                if bb and len(bb) > 0:
                    day = bb[0] if isinstance(bb, list) else bb
                    day_data["bb_charged"] = day.get("charged")
                    day_data["bb_drained"] = day.get("drained")
            except:
                pass

            history.append(day_data)

        return json.dumps({"days": days, "history": history}, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def fox_status_summary() -> str:
    """
    Get a quick human-readable summary of how Fox is doing.
    Interprets the numbers into plain language.

    Use this for a quick check-in without raw data.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        hr = client.get_heart_rates(today)
        stress = client.get_all_day_stress(today)
        bb = client.get_body_battery(today, today)

        resting_hr = hr.get("restingHeartRate") if hr else None
        stress_avg = stress.get("avgStressLevel") if stress else None

        bb_data = bb[0] if bb and len(bb) > 0 else {}
        charged = bb_data.get("charged", 0)
        drained = bb_data.get("drained", 0)

        # Interpret the data
        lines = []

        # HR interpretation
        if resting_hr:
            if resting_hr > 100:
                lines.append(f"Heart rate elevated at {resting_hr}bpm - body is working hard")
            elif resting_hr > 80:
                lines.append(f"Heart rate slightly elevated at {resting_hr}bpm")
            else:
                lines.append(f"Heart rate normal at {resting_hr}bpm")

        # Stress interpretation
        if stress_avg:
            if stress_avg > 75:
                lines.append(f"Stress is HIGH ({stress_avg}/100) - crisis territory")
            elif stress_avg > 50:
                lines.append(f"Stress is elevated ({stress_avg}/100)")
            elif stress_avg > 25:
                lines.append(f"Stress is moderate ({stress_avg}/100)")
            else:
                lines.append(f"Stress is low ({stress_avg}/100) - calm")

        # Body Battery interpretation
        net = charged - drained
        if charged == 0 and drained <= 1:
            lines.append("Body Battery empty - needs rest badly")
        elif net > 30:
            lines.append(f"Body Battery positive (+{charged}/-{drained}) - recovering well")
        elif net > 0:
            lines.append(f"Body Battery slightly positive (+{charged}/-{drained})")
        elif net > -20:
            lines.append(f"Body Battery slightly depleted (+{charged}/-{drained})")
        else:
            lines.append(f"Body Battery draining fast (+{charged}/-{drained}) - running on empty")

        summary = "\n".join(lines)

        return json.dumps({
            "summary": summary,
            "raw": {
                "hr": resting_hr,
                "stress": stress_avg,
                "bb_charged": charged,
                "bb_drained": drained
            }
        }, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_spo2() -> str:
    """
    Check Fox's blood oxygen saturation (SpO2).
    Returns current SpO2 levels and averages.

    Low SpO2 can indicate breathing issues, especially relevant
    with her chest infection history.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_spo2_data(today)

        if not data:
            return json.dumps({"message": "No SpO2 data available"})

        result = {
            "date": today,
            "average_spo2": data.get("averageSpO2"),
            "lowest_spo2": data.get("lowestSpO2"),
            "latest_spo2": data.get("latestSpO2"),
            "seven_day_avg": data.get("lastSevenDaysAvgSpO2"),
            "sleep_avg_spo2": data.get("avgSleepSpO2")
        }

        # Interpretation
        avg = result.get("average_spo2")
        if avg:
            if avg >= 95:
                result["interpretation"] = f"SpO2 {avg}% - Normal range"
            elif avg >= 90:
                result["interpretation"] = f"SpO2 {avg}% - Slightly low, monitor"
            else:
                result["interpretation"] = f"SpO2 {avg}% - LOW, may need attention"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_respiration() -> str:
    """
    Check Fox's respiration rate data.
    Returns breathing rate and timeline.

    Higher respiration can indicate stress, illness, or physical exertion.
    Normal is 12-20 breaths per minute at rest.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_respiration_data(today)

        if not data:
            return json.dumps({"message": "No respiration data available"})

        result = {
            "date": today,
            "avg_waking": data.get("avgWakingRespirationValue"),
            "avg_sleep": data.get("avgSleepRespirationValue"),
            "lowest": data.get("lowestRespirationValue"),
            "highest": data.get("highestRespirationValue")
        }

        # Get recent readings from timeline
        timeline = data.get("respirationValuesArray", [])
        if timeline:
            # Get last 5 valid readings
            recent = [r[1] for r in timeline[-5:] if r[1] > 0]
            if recent:
                result["recent_readings"] = recent
                result["current"] = recent[-1] if recent else None

        # Interpretation
        avg = result.get("avg_waking")
        if avg:
            if avg <= 20:
                result["interpretation"] = f"Breathing rate {avg}/min - Normal"
            elif avg <= 25:
                result["interpretation"] = f"Breathing rate {avg}/min - Slightly elevated"
            else:
                result["interpretation"] = f"Breathing rate {avg}/min - Elevated, may indicate stress or illness"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_stress_timeline() -> str:
    """
    Get Fox's stress levels throughout the day as a timeline.
    Shows how stress has changed over time, not just the average.

    Useful for identifying stress triggers and patterns.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_stress_data(today)

        if not data:
            return json.dumps({"message": "No stress data available"})

        result = {
            "date": today,
            "avg_stress": data.get("avgStressLevel"),
            "max_stress": data.get("maxStressLevel")
        }

        # Process timeline
        timeline = data.get("stressValuesArray", [])
        if timeline:
            # Convert timestamps to readable times and filter out invalid readings
            readings = []
            for entry in timeline:
                if len(entry) >= 2 and entry[1] >= 0:  # -1 and -2 are invalid
                    ts = datetime.fromtimestamp(entry[0] / 1000)
                    readings.append({
                        "time": ts.strftime("%H:%M"),
                        "stress": entry[1]
                    })

            result["timeline"] = readings

            # Identify spikes (readings > 75)
            spikes = [r for r in readings if r["stress"] > 75]
            if spikes:
                result["spikes"] = spikes
                result["spike_count"] = len(spikes)

        # Interpretation
        avg = result.get("avg_stress", 0)
        max_s = result.get("max_stress", 0)

        if avg > 75:
            result["interpretation"] = f"HIGH stress day (avg {avg}, max {max_s}) - Crisis territory"
        elif avg > 50:
            result["interpretation"] = f"Elevated stress (avg {avg}, max {max_s}) - Body is working hard"
        elif avg > 25:
            result["interpretation"] = f"Moderate stress (avg {avg}, max {max_s}) - Normal range"
        else:
            result["interpretation"] = f"Low stress (avg {avg}, max {max_s}) - Calm"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_cycle() -> str:
    """
    Check Fox's menstrual cycle data.
    Returns current cycle day, phase, and fertility window.

    Cycle phase affects energy, pain sensitivity, stress response,
    and cognitive function. Critical context for interpreting other metrics.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_menstrual_data_for_date(today)

        if not data or "daySummary" not in data:
            return json.dumps({"message": "No menstrual data available"})

        summary = data["daySummary"]

        # Map phase numbers to names
        phase_names = {
            1: "Menstrual (period)",
            2: "Follicular (pre-ovulation)",
            3: "Ovulation",
            4: "Luteal (post-ovulation)"
        }

        phase_num = summary.get("currentPhase")

        result = {
            "date": today,
            "cycle_start": summary.get("startDate"),
            "day_in_cycle": summary.get("dayInCycle"),
            "cycle_length": summary.get("predictedCycleLength"),
            "current_phase": phase_names.get(phase_num, f"Phase {phase_num}"),
            "phase_number": phase_num,
            "days_in_phase": summary.get("lengthOfCurrentPhase"),
            "days_until_next_phase": summary.get("daysUntilNextPhase"),
            "fertile_window_starts": summary.get("fertileWindowStart"),
            "fertile_window_length": summary.get("lengthOfFertileWindow"),
            "period_length": summary.get("periodLength"),
            "cycle_type": summary.get("cycleType")
        }

        # Phase-specific context
        if phase_num == 1:
            result["context"] = "Period phase - energy typically lowest, pain sensitivity highest, prioritize rest"
        elif phase_num == 2:
            result["context"] = "Follicular phase - energy typically rising, good time for challenging tasks"
        elif phase_num == 3:
            result["context"] = "Ovulation phase - peak energy for many, but can also bring discomfort"
        elif phase_num == 4:
            result["context"] = "Luteal phase - energy may dip, PMS symptoms possible in latter half"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_hrv_detail() -> str:
    """
    Get detailed HRV (Heart Rate Variability) data.
    HRV is a key indicator of nervous system state and recovery.

    Higher HRV = better recovery, more resilient
    Lower HRV = stress, fatigue, or illness affecting autonomic function

    Fox's baseline has been documented at 23-24ms during crisis periods.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_hrv_data(today)

        if not data:
            return json.dumps({
                "message": "No HRV data available yet",
                "note": "HRV is typically measured during sleep - check after a full night's rest"
            })

        result = {"date": today}

        if "hrvSummary" in data:
            s = data["hrvSummary"]
            result["last_night"] = s.get("lastNight")
            result["weekly_avg"] = s.get("weeklyAvg")
            result["status"] = s.get("status")
            result["baseline"] = s.get("baselineBalanced")

            # Interpretation
            last = result.get("last_night")
            if last:
                if last < 25:
                    result["interpretation"] = f"HRV {last}ms - VERY LOW (crisis/illness range)"
                elif last < 40:
                    result["interpretation"] = f"HRV {last}ms - Low (stressed/depleted)"
                elif last < 60:
                    result["interpretation"] = f"HRV {last}ms - Moderate"
                else:
                    result["interpretation"] = f"HRV {last}ms - Good recovery"

        # Include reading details if available
        if "hrvValues" in data:
            result["readings"] = data["hrvValues"]

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_sleep_detail() -> str:
    """
    Get detailed sleep data including all sleep stages.
    Returns REM, deep, light sleep breakdown and sleep quality metrics.

    Deep sleep is critical for physical recovery.
    REM sleep is critical for cognitive function and emotional processing.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_sleep_data(today)

        if not data or "dailySleepDTO" not in data:
            return json.dumps({"message": "No sleep data available for today"})

        s = data["dailySleepDTO"]

        # Check if there's actual sleep data
        if not s.get("sleepTimeSeconds"):
            return json.dumps({
                "message": "No sleep recorded yet for today",
                "note": "Sleep data appears after waking from a sleep period"
            })

        total_mins = s.get("sleepTimeSeconds", 0) // 60
        hours = total_mins // 60
        mins = total_mins % 60

        deep_mins = (s.get("deepSleepSeconds") or 0) // 60
        light_mins = (s.get("lightSleepSeconds") or 0) // 60
        rem_mins = (s.get("remSleepSeconds") or 0) // 60
        awake_mins = (s.get("awakeSleepSeconds") or 0) // 60

        result = {
            "date": today,
            "total_sleep": f"{hours}h {mins}m",
            "total_minutes": total_mins,
            "stages": {
                "deep": {"minutes": deep_mins, "percent": round(deep_mins / total_mins * 100, 1) if total_mins else 0},
                "light": {"minutes": light_mins, "percent": round(light_mins / total_mins * 100, 1) if total_mins else 0},
                "rem": {"minutes": rem_mins, "percent": round(rem_mins / total_mins * 100, 1) if total_mins else 0},
                "awake": {"minutes": awake_mins, "percent": round(awake_mins / total_mins * 100, 1) if total_mins else 0}
            },
            "sleep_start": s.get("sleepStartTimestampLocal"),
            "sleep_end": s.get("sleepEndTimestampLocal")
        }

        # Quality interpretation
        interpretations = []

        if total_mins < 360:  # Less than 6 hours
            interpretations.append("Short sleep duration - may affect recovery")
        elif total_mins >= 420:  # 7+ hours
            interpretations.append("Good sleep duration")

        if total_mins > 0:
            deep_pct = deep_mins / total_mins * 100
            rem_pct = rem_mins / total_mins * 100

            if deep_pct < 15:
                interpretations.append("Low deep sleep - physical recovery may be impacted")
            elif deep_pct >= 20:
                interpretations.append("Good deep sleep for physical recovery")

            if rem_pct < 15:
                interpretations.append("Low REM - cognitive/emotional processing may be affected")
            elif rem_pct >= 20:
                interpretations.append("Good REM for cognitive function")

        result["interpretation"] = "; ".join(interpretations) if interpretations else "Sleep analysis complete"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_body_battery_timeline() -> str:
    """
    Get Body Battery timeline showing energy levels throughout the day.
    Shows when energy was charged (rest) vs drained (activity/stress).
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        # Get stress data which includes body battery timeline
        data = client.get_stress_data(today)

        if not data:
            return json.dumps({"message": "No body battery timeline available"})

        result = {"date": today}

        # Process body battery timeline
        bb_timeline = data.get("bodyBatteryValuesArray", [])
        if bb_timeline:
            readings = []
            for entry in bb_timeline:
                if len(entry) >= 3:
                    ts = datetime.fromtimestamp(entry[0] / 1000)
                    readings.append({
                        "time": ts.strftime("%H:%M"),
                        "status": entry[1],
                        "level": entry[2]
                    })

            result["timeline"] = readings

            # Current and range
            if readings:
                levels = [r["level"] for r in readings if r["level"] is not None]
                if levels:
                    result["current_level"] = levels[-1]
                    result["high_today"] = max(levels)
                    result["low_today"] = min(levels)

        # Also get the charged/drained summary
        try:
            bb = client.get_body_battery(today, today)
            if bb and len(bb) > 0:
                day = bb[0] if isinstance(bb, list) else bb
                result["charged_today"] = day.get("charged")
                result["drained_today"] = day.get("drained")
        except:
            pass

        # Interpretation
        current = result.get("current_level")
        if current is not None:
            if current <= 10:
                result["interpretation"] = f"Body Battery at {current} - EMPTY, needs rest urgently"
            elif current <= 25:
                result["interpretation"] = f"Body Battery at {current} - Very low, prioritize rest"
            elif current <= 50:
                result["interpretation"] = f"Body Battery at {current} - Moderate, pace yourself"
            elif current <= 75:
                result["interpretation"] = f"Body Battery at {current} - Good energy"
            else:
                result["interpretation"] = f"Body Battery at {current} - Well rested"

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def check_fox_training_readiness() -> str:
    """
    Check training readiness score.
    Combines sleep, recovery, and training load to assess
    if body is ready for activity or needs rest.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        data = client.get_training_readiness(today)

        if not data or len(data) == 0:
            # Try morning readiness as fallback
            try:
                morning = client.get_morning_training_readiness(today)
                if morning:
                    return json.dumps({
                        "date": today,
                        "source": "morning_readiness",
                        "data": morning
                    }, indent=2)
            except:
                pass

            return json.dumps({
                "message": "No training readiness data available",
                "note": "This metric requires sufficient activity and sleep data to calculate"
            })

        result = {
            "date": today,
            "data": data
        }

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


@mcp.tool()
def fox_full_status() -> str:
    """
    Comprehensive health check - pulls all available metrics at once.
    Use this for a complete picture of how Fox is doing.

    Returns: HR, stress, body battery, respiration, cycle phase, sleep,
    SpO2, HRV, and interpretations for each.
    """
    try:
        client = get_client()
        today = date.today().strftime("%Y-%m-%d")

        result = {
            "timestamp": datetime.now().isoformat(),
            "date": today,
            "metrics": {}
        }

        # Heart Rate
        try:
            hr = client.get_heart_rates(today)
            result["metrics"]["heart_rate"] = {
                "resting": hr.get("restingHeartRate"),
                "max": hr.get("maxHeartRate"),
                "min": hr.get("minHeartRate")
            }
        except:
            result["metrics"]["heart_rate"] = None

        # Stress
        try:
            stress = client.get_stress_data(today)
            if stress:
                result["metrics"]["stress"] = {
                    "avg": stress.get("avgStressLevel"),
                    "max": stress.get("maxStressLevel")
                }
        except:
            result["metrics"]["stress"] = None

        # Body Battery
        try:
            bb = client.get_body_battery(today, today)
            if bb and len(bb) > 0:
                day = bb[0] if isinstance(bb, list) else bb
                result["metrics"]["body_battery"] = {
                    "charged": day.get("charged"),
                    "drained": day.get("drained")
                }
        except:
            result["metrics"]["body_battery"] = None

        # Respiration
        try:
            resp = client.get_respiration_data(today)
            if resp:
                result["metrics"]["respiration"] = {
                    "avg_waking": resp.get("avgWakingRespirationValue"),
                    "avg_sleep": resp.get("avgSleepRespirationValue")
                }
        except:
            result["metrics"]["respiration"] = None

        # SpO2
        try:
            spo2 = client.get_spo2_data(today)
            if spo2:
                result["metrics"]["spo2"] = {
                    "average": spo2.get("averageSpO2"),
                    "lowest": spo2.get("lowestSpO2")
                }
        except:
            result["metrics"]["spo2"] = None

        # HRV
        try:
            hrv = client.get_hrv_data(today)
            if hrv and "hrvSummary" in hrv:
                s = hrv["hrvSummary"]
                result["metrics"]["hrv"] = {
                    "last_night": s.get("lastNight"),
                    "weekly_avg": s.get("weeklyAvg"),
                    "status": s.get("status")
                }
        except:
            result["metrics"]["hrv"] = None

        # Menstrual Cycle
        try:
            cycle = client.get_menstrual_data_for_date(today)
            if cycle and "daySummary" in cycle:
                s = cycle["daySummary"]
                phase_names = {1: "Menstrual", 2: "Follicular", 3: "Ovulation", 4: "Luteal"}
                result["metrics"]["cycle"] = {
                    "day": s.get("dayInCycle"),
                    "phase": phase_names.get(s.get("currentPhase"), "Unknown"),
                    "days_until_next_phase": s.get("daysUntilNextPhase")
                }
        except:
            result["metrics"]["cycle"] = None

        # Sleep (from last night)
        try:
            sleep = client.get_sleep_data(today)
            if sleep and "dailySleepDTO" in sleep:
                s = sleep["dailySleepDTO"]
                if s.get("sleepTimeSeconds"):
                    total_mins = s.get("sleepTimeSeconds", 0) // 60
                    result["metrics"]["sleep"] = {
                        "total_hours": round(total_mins / 60, 1),
                        "deep_mins": (s.get("deepSleepSeconds") or 0) // 60,
                        "rem_mins": (s.get("remSleepSeconds") or 0) // 60
                    }
        except:
            result["metrics"]["sleep"] = None

        # Build summary
        summary_lines = []

        hr_rest = result["metrics"].get("heart_rate", {})
        if hr_rest and hr_rest.get("resting"):
            hr_val = hr_rest["resting"]
            if hr_val > 100:
                summary_lines.append(f"⚠️ HR elevated: {hr_val}bpm")
            else:
                summary_lines.append(f"HR: {hr_val}bpm")

        stress = result["metrics"].get("stress", {})
        if stress and stress.get("avg"):
            s_val = stress["avg"]
            if s_val > 75:
                summary_lines.append(f"⚠️ HIGH stress: {s_val}/100")
            elif s_val > 50:
                summary_lines.append(f"Stress elevated: {s_val}/100")
            else:
                summary_lines.append(f"Stress: {s_val}/100")

        bb = result["metrics"].get("body_battery", {})
        if bb:
            charged = bb.get("charged", 0)
            drained = bb.get("drained", 0)
            if charged == 0:
                summary_lines.append(f"⚠️ Body Battery empty (+{charged}/-{drained})")
            else:
                summary_lines.append(f"Body Battery: +{charged}/-{drained}")

        cycle = result["metrics"].get("cycle", {})
        if cycle:
            summary_lines.append(f"Cycle: Day {cycle.get('day')} ({cycle.get('phase')})")

        resp = result["metrics"].get("respiration", {})
        if resp and resp.get("avg_waking"):
            summary_lines.append(f"Breathing: {resp['avg_waking']}/min")

        result["summary"] = " | ".join(summary_lines)

        return json.dumps(result, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)})


if __name__ == "__main__":
    mcp.run()
