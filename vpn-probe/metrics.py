"""Small bounded Prometheus exporter for the probe's fixed check/route combinations."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time


METRIC_TYPES = {
    'vpn_probe_checks_total': 'counter',
    'vpn_probe_received_bytes_total': 'counter',
    'vpn_probe_success': 'gauge',
    'vpn_probe_last_check_timestamp_seconds': 'gauge',
    'vpn_probe_last_success_timestamp_seconds': 'gauge',
    'vpn_probe_duration_seconds': 'gauge',
    'vpn_probe_response_bytes': 'gauge',
    'vpn_probe_http_status_code': 'gauge',
    'vpn_probe_curl_exit_code': 'gauge',
}


def quoted(value):
    return '"' + str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'


class ProbeMetrics:
    def __init__(self):
        self.lock = threading.Lock()
        self.results = {}

    def record(self, profile, check, route, result, now=None):
        if check not in {'https', 'exit_ip', 'download_64k', 'download_64k_30s',
                         'ipv6_entry', 'ipv6_control'} or route not in {'direct', 'vpn'}:
            return
        now = time.time() if now is None else now
        with self.lock:
            key = (profile, check, route)
            state = self.results.setdefault(key, {'successes': 0, 'failures': 0, 'last_success': 0, 'bytes_total': 0})
            state['successes' if result['ok'] else 'failures'] += 1
            state['bytes_total'] += result.get('bytes', 0)
            state['last_check'] = now
            if result['ok']:
                state['last_success'] = now
            # Only known numeric fields are exported; never IPs, URLs, UUIDs or run IDs.
            state['result'] = {k: result[k] for k in
                               ['ok', 'duration_ms', 'bytes', 'http_status', 'curl_exit'] if k in result}

    def render(self):
        lines = [f'# TYPE {name} {kind}' for name, kind in METRIC_TYPES.items()]
        with self.lock:
            for (profile, check, route), state in sorted(self.results.items()):
                labels = f'profile={quoted(profile)},check={quoted(check)},route={quoted(route)}'
                for outcome, count in [('success', state['successes']), ('failure', state['failures'])]:
                    lines.append(f'vpn_probe_checks_total{{{labels},result="{outcome}"}} {count}')
                result = state['result']
                values = {
                    'vpn_probe_received_bytes_total': state['bytes_total'],
                    'vpn_probe_success': int(result['ok']),
                    'vpn_probe_last_check_timestamp_seconds': state['last_check'],
                    'vpn_probe_last_success_timestamp_seconds': state['last_success'],
                    'vpn_probe_duration_seconds': result.get('duration_ms', 0) / 1000,
                    'vpn_probe_response_bytes': result.get('bytes', 0),
                    'vpn_probe_http_status_code': result.get('http_status', 0),
                    'vpn_probe_curl_exit_code': result.get('curl_exit', -1),
                }
                lines.extend(f'{name}{{{labels}}} {value}' for name, value in values.items())
        return '\n'.join(lines) + '\n'


def start_server(metrics, address=('0.0.0.0', 8080)):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != '/metrics':
                self.send_error(404)
                return
            body = metrics.render().encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(address, Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
