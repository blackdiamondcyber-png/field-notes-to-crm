# Eval report: v2

Records evaluated: 150 (failures: 0)

| Metric | v2 |
|---|---|
| Activity type accuracy | 85.3% |
| next_action_date exact match | 90.0% |
| next_action null-handling accuracy | 88.0% |
| products_mentioned F1 | 88.7% |
| contacts F1 | 99.7% |
| office_name exact match | 100.0% |
| Hallucination rate | 12.0% |
| Mean latency | 3331 ms |
| Total tokens (in/out) | 279027 / 47750 |
| Estimated cost | $1.0356 |

## Per-class activity_type metrics (v2)

| Type | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| call | 83.8% | 100.0% | 91.2% | 31 |
| email | 100.0% | 66.7% | 80.0% | 24 |
| visit | 100.0% | 57.7% | 73.2% | 26 |
| note | 96.4% | 93.1% | 94.7% | 29 |
| demo | 72.7% | 94.1% | 82.1% | 17 |
| quote | 71.9% | 100.0% | 83.6% | 23 |

## Comparison: v1 vs v2

| Metric | v1 | v2 |
|---|---|---|
| Activity type accuracy | 94.0% | 85.3% |
| next_action_date exact match | 90.7% | 90.0% |
| next_action null-handling accuracy | 81.3% | 88.0% |
| products_mentioned F1 | 83.3% | 88.7% |
| contacts F1 | 63.3% | 99.7% |
| office_name exact match | 100.0% | 100.0% |
| Hallucination rate | 19.3% | 12.0% |
| Estimated cost | $0.7718 | $1.0356 |
