// LCPTMS Historical Calibration v0.1
// Derived from PLATON LIST.xlsx (62 historical movements).
// This is an initial sample, not a final operational standard.

export const HISTORICAL_CALIBRATION_VERSION="0.1.0";

export const HISTORICAL_SUMMARY=Object.freeze({
  "records": 62,
  "schedule_variance": {
    "n": 37,
    "median_min": 14.0,
    "mean_min": 26.6
  },
  "actual_start_to_36_inbound": {
    "n": 30,
    "median_min": 58.5,
    "mean_min": 71.3
  },
  "actual_start_to_36_outbound": {
    "n": 24,
    "median_min": 231.5,
    "mean_min": 211.1
  }
});

export function historicalScheduleVarianceMinutes(){
  return HISTORICAL_SUMMARY.schedule_variance.median_min;
}

export function historicalStartTo36(direction){
  if(direction==="INBOUND") return HISTORICAL_SUMMARY.actual_start_to_36_inbound;
  if(direction==="OUTBOUND") return HISTORICAL_SUMMARY.actual_start_to_36_outbound;
  return null;
}
