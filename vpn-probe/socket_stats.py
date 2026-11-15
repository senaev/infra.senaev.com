"""Bounded read-only ss observations of one child process; no packet capture."""
import re
import subprocess
import threading
import time


FIELDS = ("mss", "rcvmss", "advmss", "pmtu", "unacked", "lost",
          "retrans", "bytes_acked", "bytes_received", "segs_out", "segs_in")


def parse_stats(output, pid, identities=None):
    """Associate ss detail lines only with sockets owned by this Xray child."""
    rows = []
    owned = False
    identity = None
    state = None
    for line in output.splitlines():
        if line and not line[0].isspace():
            owned = f"pid={pid}," in line
            inode = re.search(r"\bino:(\d+)", line)
            identity = None
            state = line.split()[0] if line.split() else None
            if owned and identities is not None and inode:
                identity = identities.setdefault(inode[1], len(identities) + 1)
        elif owned:
            row = {}
            for field in FIELDS:
                match = re.search(r"(?:^|\s)" + field + r":(\d+)(?:/(\d+))?", line)
                if match:
                    row[field] = int(match[1])
                    if field == "retrans" and match[2]:
                        row["total_retrans"] = int(match[2])
            if row:
                if identities is not None:
                    row["socket_id"] = identity
                    row["state"] = state
                rows.append(row)
    return rows


class SocketStats:
    def __init__(self, pid):
        self.pid = pid
        self.done = threading.Event()
        self.samples = []
        self.unavailable = None
        self.identities = {}
        self.phase = "exit_gate"
        self.thread = threading.Thread(target=self.collect, daemon=True)

    def collect(self):
        started = time.monotonic()
        for _ in range(60):
            if self.done.is_set():
                return
            phase = self.phase
            try:
                result = subprocess.run(
                    ["ss", "-H", "-t", "-i", "-n", "-p", "-e", "dport", "=", ":443"],
                    capture_output=True, text=True, timeout=1, check=False)
                if result.returncode:
                    self.unavailable = "ss_failed"
                    return
                rows = parse_stats(result.stdout, self.pid, self.identities)
                if rows:
                    self.samples.append({"elapsed_seconds": round(time.monotonic() - started, 3),
                                         "phase": phase, "sockets": rows[:8]})
            except (OSError, subprocess.SubprocessError):
                self.unavailable = "ss_unavailable"
                return
            if self.done.wait(1):
                return

    def start(self):
        self.thread.start()

    def finish(self):
        self.done.set()
        self.thread.join(2)
        return {"socket_samples": self.samples,
                "socket_stats_status": self.unavailable or (
                    "observed" if self.samples else "no_owned_socket_observed"),
                "socket_sample_interval_seconds": 1}
