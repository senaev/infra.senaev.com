import unittest
from unittest.mock import patch

import metrics
import probe


OK = {'ok': True, 'curl_exit': 0, 'http_status': 200, 'bytes': 16384, 'tls_ms': 500}


class FailureStageTests(unittest.TestCase):
    def test_stages(self):
        self.assertIsNone(probe.failure_stage({'ok': True}))
        self.assertEqual(probe.failure_stage({'ok': False, 'failure': 'probe_execution_failed'}), 'probe')
        self.assertEqual(probe.failure_stage({'ok': False, 'tls_ms': 0, 'bytes': 0}), 'setup')
        self.assertEqual(probe.failure_stage({'ok': False, 'tls_ms': 600, 'bytes': 0}), 'response')
        self.assertEqual(probe.failure_stage({'ok': False, 'tls_ms': 600, 'bytes': 3748}), 'transfer')


class ParityRoundTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.request', return_value=(OK, ''))
    @patch('probe.random.uniform', return_value=3)
    @patch('probe.STOP')
    def test_pairs_every_size_on_both_routes_with_order(self, stop, jitter, request, emit):
        stop.wait.return_value = False
        self.assertTrue(probe.parity_round('home', 'socks5h://127.0.0.1:1080', 'round', True))
        calls = [(c.args[0], c.args[1]) for c in request.call_args_list]
        self.assertEqual(calls, [
            ('https://httpbingo.org/bytes/16384', 'socks5h://127.0.0.1:1080'),
            ('https://httpbingo.org/bytes/16384', ''),
            ('https://httpbingo.org/bytes/65536', 'socks5h://127.0.0.1:1080'),
            ('https://httpbingo.org/bytes/65536', ''),
            ('https://httpbingo.org/bytes/262144', 'socks5h://127.0.0.1:1080'),
            ('https://httpbingo.org/bytes/262144', '')])
        budgets = [(c.kwargs['timeout'], c.kwargs['connect_timeout'], c.kwargs['expected_bytes'])
                   for c in request.call_args_list[::2]]
        self.assertEqual(budgets, [(10, 10, 16384), (14, 10, 65536), (26, 10, 262144)])
        checks = [(c.args[1], c.args[2]) for c in emit.call_args_list]
        self.assertEqual(checks[:2], [('parity_httpbingo_16384', 'vpn'),
                                      ('parity_httpbingo_16384', 'direct')])
        self.assertTrue(all(c.args[3]['experiment_id'] == 'round' for c in emit.call_args_list))
        self.assertNotIn('failure_stage', emit.call_args_list[0].args[3])

    @patch('probe.emit')
    @patch('probe.request', return_value=({'ok': False, 'tls_ms': 0, 'bytes': 0, 'curl_exit': 28}, ''))
    @patch('probe.random.uniform', return_value=3)
    @patch('probe.STOP')
    def test_direct_first_and_failure_stage(self, stop, jitter, request, emit):
        stop.wait.return_value = False
        self.assertFalse(probe.parity_round('home', 'proxy', 'round', False))
        self.assertEqual(request.call_args_list[0].args[1], '')
        self.assertEqual(emit.call_args_list[0].args[3]['failure_stage'], 'setup')
        self.assertEqual(len(emit.call_args_list), 6)

    @patch('probe.emit')
    @patch('probe.request')
    @patch('probe.random.uniform', return_value=3)
    @patch('probe.STOP')
    def test_stop_interrupts_round(self, stop, jitter, request, emit):
        stop.wait.return_value = True
        self.assertFalse(probe.parity_round('home', 'proxy', 'round', True))
        request.assert_not_called()


class ParityLoopTests(unittest.TestCase):
    @patch('probe.time.monotonic', side_effect=[100, 400])
    @patch('probe.random.random', return_value=0.2)
    @patch('probe.random.uniform', side_effect=[30, 620])
    @patch('probe.parity_round')
    @patch('probe.STOP')
    def test_ten_minute_start_cadence(self, stop, round_, uniform, rnd, clock):
        stop.wait.side_effect = [False, True]
        stop.is_set.return_value = False
        probe.parity_loop('home', 'proxy')
        self.assertEqual(round_.call_count, 1)
        self.assertTrue(round_.call_args.args[3])
        self.assertEqual([c.args[0] for c in stop.wait.call_args_list], [30, 320])

    @patch('probe.emit')
    @patch('probe.parity_loop', side_effect=RuntimeError('boom'))
    @patch('probe.STOP')
    def test_guard_stops_pod_on_worker_failure(self, stop, loop, emit):
        probe.parity_guard('home', 'proxy')
        stop.set.assert_called_once()
        self.assertEqual(emit.call_args.args[3]['failure'], 'parity_worker_failed')


class ParityMetricsTests(unittest.TestCase):
    def test_parity_checks_are_exported(self):
        exporter = metrics.ProbeMetrics()
        for size in probe.PARITY_SIZES:
            exporter.record('home', f'parity_httpbingo_{size}', 'vpn', {'ok': True, 'bytes': size}, now=1)
        rendered = exporter.render()
        for size in probe.PARITY_SIZES:
            self.assertIn(f'check="parity_httpbingo_{size}",route="vpn",result="success"}} 1', rendered)


if __name__ == '__main__':
    unittest.main()
