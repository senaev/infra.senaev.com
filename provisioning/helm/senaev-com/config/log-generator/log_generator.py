#!/usr/bin/env python3
"""
Datadog Log Generator - headless stdout emitter.

Continuously prints randomized, structured JSON application log lines to stdout
so the Datadog node Agent (containerCollectAll) can pick them up and auto-parse
the JSON attributes. No HTTP server, no API, no file output - just an infinite
internal loop.

Stdlib only, so it runs on a stock python:3-slim image with no dependencies.
"""
import json
import random
import time
from datetime import datetime, timezone

# Hardcoded emission rate: number of log lines produced every second.
LOGS_PER_SECOND = 10

SERVICES = [
    "web-frontend", "auth-service", "payment-api", "user-service",
    "inventory-service", "notification-service", "search-service", "cart-service",
]
LOG_LEVELS = ["INFO", "INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR"]
ACTIONS = {
    "web-frontend":         ["page_view", "button_click", "form_submit", "session_start", "session_end", "asset_loaded"],
    "auth-service":         ["user_login", "user_logout", "token_refresh", "password_reset", "mfa_verified", "auth_failed"],
    "payment-api":          ["charge_initiated", "charge_succeeded", "charge_failed", "refund_processed", "fraud_check"],
    "user-service":         ["user_created", "profile_updated", "user_deleted", "preferences_saved", "avatar_uploaded"],
    "inventory-service":    ["stock_check", "item_reserved", "stock_updated", "low_stock_alert", "reorder_triggered"],
    "notification-service": ["email_sent", "sms_sent", "push_sent", "delivery_failed", "unsubscribe_processed"],
    "search-service":       ["query_executed", "index_updated", "cache_hit", "cache_miss", "ranking_computed"],
    "cart-service":         ["item_added", "item_removed", "cart_cleared", "cart_saved", "checkout_started"],
}
ERROR_MSGS = [
    "Connection timeout after 30000ms", "Invalid credentials provided",
    "Upstream service unavailable", "Rate limit exceeded: 429",
    "Database query failed: deadlock detected", "Payload too large: max 10MB",
    "SSL certificate validation failed", "Insufficient permissions for resource",
]
WARN_MSGS = [
    "Response time approaching SLA threshold", "Retry attempt 2 of 3",
    "Cache eviction rate unusually high", "Memory usage above 80%",
    "Deprecated API version called",
]
HOSTS = ["web-01", "web-02", "api-01", "api-02", "worker-01", "worker-02"]


def random_req_id():
    return "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=8))


def generate_log_line():
    now     = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    level   = random.choice(LOG_LEVELS)
    service = random.choice(SERVICES)
    action  = random.choice(ACTIONS[service])
    host    = random.choice(HOSTS)
    req_id  = random_req_id()
    user_id = random.randint(1000, 99999)
    ip      = f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"

    log = {
        "log_generator": True,
        "timestamp":  now,
        "level":      level,
        "host":       host,
        "env":        "production",
        "service":    service,
        "request_id": req_id,
        "user_id":    user_id,
        "client_ip":  ip,
        "action":     action,
    }

    if level == "ERROR":
        log["message"] = random.choice(ERROR_MSGS)
        log["status"]  = "error"
    elif level == "WARN":
        log["message"]    = random.choice(WARN_MSGS)
        log["latency_ms"] = random.randint(280, 990)
    elif level == "DEBUG":
        log["duration_ms"] = random.randint(1, 20)
        log["cache"]       = "hit" if random.random() > 0.5 else "miss"
    else:
        log["duration_ms"] = random.randint(5, 250)
        log["http_status"] = random.choice([200, 200, 200, 201, 204, 304])

    return json.dumps(log)


def main():
    interval = 1.0 / LOGS_PER_SECOND
    while True:
        start = time.monotonic()
        print(generate_log_line(), flush=True)
        # Pace evenly across the second, accounting for generation time.
        elapsed = time.monotonic() - start
        sleep_for = interval - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for)


if __name__ == "__main__":
    main()
