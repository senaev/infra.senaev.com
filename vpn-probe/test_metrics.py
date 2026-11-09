import unittest
from metrics import ProbeMetrics


class MetricsTests(unittest.TestCase):
    def test_counters_latest_result_and_last_success(self):
        metrics = ProbeMetrics()
        metrics.record('one', 'https', 'vpn', {'ok': True, 'duration_ms': 250, 'bytes': 20}, now=100)
        metrics.record('one', 'https', 'vpn', {'ok': False, 'duration_ms': 8000, 'bytes': 4}, now=130)
        text = metrics.render()
        labels = 'profile="one",check="https",route="vpn"'
        self.assertIn(f'vpn_probe_checks_total{{{labels},result="success"}} 1', text)
        self.assertIn(f'vpn_probe_checks_total{{{labels},result="failure"}} 1', text)
        self.assertIn(f'vpn_probe_received_bytes_total{{{labels}}} 24', text)
        self.assertIn(f'vpn_probe_success{{{labels}}} 0', text)
        self.assertIn(f'vpn_probe_last_check_timestamp_seconds{{{labels}}} 130', text)
        self.assertIn(f'vpn_probe_last_success_timestamp_seconds{{{labels}}} 100', text)
        self.assertIn(f'vpn_probe_duration_seconds{{{labels}}} 8.0', text)

    def test_label_escaping_and_no_sensitive_or_unbounded_labels(self):
        metrics = ProbeMetrics()
        metrics.record('a"b\\c\nd', 'exit_ip', 'vpn',
                       {'ok': True, 'exit_ip': '1.2.3.4', 'run_id': 'random-secret', 'url': 'private-url'}, now=1)
        text = metrics.render()
        self.assertIn('profile="a\\"b\\\\c\\nd"', text)
        for value in ['1.2.3.4', 'random-secret', 'private-url']:
            self.assertNotIn(value, text)
        metrics.record('one', 'arbitrary-check', 'vpn', {'ok': True}, now=2)
        self.assertNotIn('arbitrary-check', metrics.render())

    def test_no_success_is_created_before_an_observation(self):
        metrics = ProbeMetrics()
        self.assertTrue(all(line.startswith('#') for line in metrics.render().splitlines()))
        metrics.record('one', 'https', 'direct', {'ok': False}, now=10)
        self.assertIn('vpn_probe_last_success_timestamp_seconds{profile="one",check="https",route="direct"} 0', metrics.render())


    def test_diagnostic_checks_are_exported_separately(self):
        metrics = ProbeMetrics()
        for check in ['download_64k', 'download_64k_30s', 'ipv6_entry', 'ipv6_control']:
            metrics.record('one', check, 'direct', {'ok': True}, now=1)
        metrics.record('one', 'download_64k', 'direct', {'ok': False}, now=2)
        text = metrics.render()
        self.assertIn('vpn_probe_success{profile="one",check="download_64k",route="direct"} 0', text)
        self.assertIn('vpn_probe_success{profile="one",check="download_64k_30s",route="direct"} 1', text)
        for check in ['ipv6_entry', 'ipv6_control']:
            self.assertIn(f'check="{check}"', text)

    def test_transfer_conditions_are_fixed_and_ids_are_not_labels(self):
        metrics = ProbeMetrics()
        for check in ['experiment_client_alive', 'transfer_precheck',
                      'transfer_cloudflare_4096', 'transfer_cloudflare_16384',
                      'transfer_cloudflare_65536', 'transfer_httpbingo_4096',
                      'transfer_httpbingo_16384', 'transfer_httpbingo_65536']:
            metrics.record('one', check, 'vpn', {'ok': True, 'experiment_id': 'unique-id'}, now=1)
            self.assertIn(f'check="{check}"', metrics.render())
        metrics.record('one', 'transfer_skipped', 'vpn', {'ok': False}, now=1)
        self.assertNotIn('transfer_skipped', metrics.render())
        self.assertNotIn('unique-id', metrics.render())

    def test_fresh_and_reused_results_remain_separate_in_dashboard_metrics(self):
        metrics = ProbeMetrics()
        for check, ok in [('diagnostic_fresh_trace', True), ('diagnostic_reused_trace', False)]:
            metrics.record('one', check, 'xhttp', {'ok': ok, 'experiment_id': 'secret-id'}, now=1)
            self.assertIn(f'vpn_probe_success{{profile="one",check="{check}",route="xhttp"}} {int(ok)}', metrics.render())
        self.assertNotIn('secret-id', metrics.render())
