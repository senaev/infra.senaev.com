import unittest
from unittest.mock import patch

import metrics
import probe


OK = {'ok': True, 'curl_exit': 0, 'http_status': 200, 'bytes': 1, 'tls_ms': 500}


class LegThroughputRoundTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.request', return_value=(OK, ''))
    @patch('probe.random.uniform', return_value=3)
    @patch('probe.STOP')
    def test_uncapped_direct_downloads_from_the_server(self, stop, jitter, request, emit):
        stop.wait.return_value = False
        self.assertTrue(probe.leg_throughput_round('source', 'round'))
        calls = [(c.args[0], c.args[1], c.kwargs['timeout'], c.kwargs['limit_rate'],
                  c.kwargs['http1'], c.kwargs['expected_bytes']) for c in request.call_args_list]
        self.assertEqual(calls, [
            ('https://speed.cloudflare.com/__down?bytes=4194304', '', 42, None, False, 4194304),
            ('https://senaev.com/api/vpn-test?bytes=524288', '', 15, None, True, 524288)])
        self.assertEqual([(c.args[1], c.args[2]) for c in emit.call_args_list],
                         [('leg_cloudflare_4194304', 'direct'), ('leg_hetzner_524288', 'direct')])
        self.assertEqual(emit.call_args_list[0].args[3]['experiment_id'], 'round')

    @patch('probe.emit')
    @patch('probe.request', return_value=({'ok': False, 'tls_ms': 400, 'bytes': 9000, 'curl_exit': 28}, ''))
    @patch('probe.random.uniform', return_value=3)
    @patch('probe.STOP')
    def test_failure_stage_is_reported(self, stop, jitter, request, emit):
        stop.wait.return_value = False
        self.assertFalse(probe.leg_throughput_round('source', 'round'))
        self.assertEqual(emit.call_args_list[0].args[3]['failure_stage'], 'transfer')

    @patch('probe.request')
    @patch('probe.random.uniform', return_value=3)
    @patch('probe.STOP')
    def test_stop_interrupts_round(self, stop, jitter, request):
        stop.wait.return_value = True
        self.assertFalse(probe.leg_throughput_round('source', 'round'))
        request.assert_not_called()


class LegThroughputLoopTests(unittest.TestCase):
    @patch('probe.time.monotonic', side_effect=[100, 400])
    @patch('probe.random.uniform', side_effect=[120, 1830])
    @patch('probe.leg_throughput_round')
    @patch('probe.STOP')
    def test_thirty_minute_start_cadence(self, stop, round_, uniform, clock):
        stop.wait.side_effect = [False, True]
        stop.is_set.return_value = False
        probe.leg_throughput_loop('source')
        self.assertEqual(round_.call_count, 1)
        self.assertEqual([c.args[0] for c in stop.wait.call_args_list], [120, 1530])


class LegThroughputMetricsTests(unittest.TestCase):
    def test_leg_checks_are_exported(self):
        exporter = metrics.ProbeMetrics()
        for check, *_ in probe.LEG_CONDITIONS:
            exporter.record('source', check, 'direct', {'ok': True, 'bytes': 1, 'duration_ms': 900}, now=1)
        rendered = exporter.render()
        for check, *_ in probe.LEG_CONDITIONS:
            self.assertIn(f'vpn_probe_success_duration_seconds_total{{profile="source",check="{check}",'
                          'route="direct"} 0.9', rendered)


if __name__ == '__main__':
    unittest.main()
