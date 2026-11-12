import json
import os
import subprocess
import unittest
from unittest.mock import Mock, patch

import probe
from xhttp_server import server_config


class DiagnosticTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', side_effect=[False, True, True, True, True, True])
    def test_failure_of_first_tls_client_does_not_skip_the_second(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertEqual(fresh.call_count, 6)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    def test_same_trace_budgets_and_alternating_serial_order(self, fresh, wait, emit):
        for http1_first in [False, True]:
            self.assertTrue(probe.xhttp_transport_controls('test', None, 'round', http1_first))
        arms = [x for x in fresh.call_args_list if not x.kwargs.get('measure_sizes') and not x.kwargs.get('payload_size')]
        self.assertEqual([x.kwargs['http1'] for x in arms], [False, True, True, False])
        self.assertEqual(sum(x.kwargs.get('measure_sizes', False) for x in fresh.call_args_list), 2)
        self.assertEqual([x.kwargs.get('measure_sizes', False) for x in fresh.call_args_list],
                         [False, False, True, False, False, False, False, False, True, False, False, False])
        self.assertTrue(all(x.kwargs['native_tls'] is True for x in fresh.call_args_list))
        self.assertTrue(all(x.args == ('test', None, 'round') for x in fresh.call_args_list))
        self.assertEqual(wait.call_count, 12)
        self.assertTrue(all(60 <= x.args[0] <= 90 for x in wait.call_args_list))

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.xhttp_transport_controls')
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_direct_and_tcp_trace_controls_have_short_jitter(self, request, versions, wait, emit):
        probe.xhttp_response_diagnostics('test', 'baseline', None, 'round')
        self.assertEqual([x.args[1] for x in request.call_args_list], ['', 'baseline'])
        self.assertTrue(all(x.args[0] == 'https://www.cloudflare.com/cdn-cgi/trace'
                            and x.args[2] == 4096 for x in request.call_args_list))
        self.assertEqual(wait.call_count, 2)
        self.assertTrue(all(2 <= x.args[0] <= 7 for x in wait.call_args_list))
        versions.assert_called_once_with('test', None, 'round', http1_first=False)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=True)
    @patch('probe.fresh_xhttp_exit_control')
    def test_shutdown_during_quiet_wait_starts_no_candidate(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        fresh.assert_not_called()

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    @patch('probe.xhttp_exit_control', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_diagnostic_success_does_not_promote_failed_candidate(self, request, exit_control, fresh, wait, emit):
        self.assertFalse(probe.transfer_round('test', 'baseline', xhttp_proxy='candidate', diagnostics=True))
        exit_control.assert_called_once()
        self.assertEqual(request.call_count, 20)
        self.assertEqual(fresh.call_count, 6)
        skips = [c for c in emit.call_args_list if c.args[1] == 'transfer_skipped']
        self.assertEqual(len(skips), 6)
        self.assertFalse(any(c.args[2] == 'xhttp' and c.args[1].startswith('transfer_')
                             and c.args[1] != 'transfer_skipped' for c in emit.call_args_list))

    @patch('probe.xhttp_response_diagnostics')
    @patch('probe.xhttp_exit_control', return_value=False)
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_diagnostics_disabled_keeps_original_baseline_only_behavior(self, request, wait, emit, control, diagnostics):
        self.assertFalse(probe.transfer_round('test', 'baseline', xhttp_proxy='candidate'))
        diagnostics.assert_not_called()
        self.assertEqual(request.call_count, 18)

    @patch('probe.subprocess.run')
    def test_request_records_numeric_response_stage_without_sensitive_curl_metadata(self, run):
        info = {'http_code': 0, 'time_appconnect': 2.875, 'time_pretransfer': 2.9,
                'time_starttransfer': 0, 'size_request': 75, 'size_header': 0,
                'url_effective': 'private-value', 'errormsg': 'private-error'}
        run.return_value = subprocess.CompletedProcess([], 28, json.dumps(info), 'private-stderr')
        result, _ = probe.request('https://example.test', 'candidate', 4096)
        self.assertEqual(result['tls_ms'], 2875)
        self.assertEqual(result['pretransfer_ms'], 2900)
        self.assertEqual(result['first_byte_ms'], 0)
        self.assertEqual(result['request_bytes'], 75)
        self.assertEqual(result['response_header_bytes'], 0)
        self.assertNotIn('private', str(result))

    def test_info_logging_is_only_enabled_explicitly_on_experimental_backend(self):
        self.assertEqual(server_config('base', '/test/')['log']['loglevel'], 'warning')
        self.assertEqual(server_config('base', '/test/', diagnostics=True)['log']['loglevel'], 'info')


class FreshClientTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            'XHTTP_PROFILE_LINK': 'vless://{XRAY_USER_UUID:xhttp-probe}@senaev.com:443?type=xhttp&security=tls&fp=chrome&sni=senaev.com&mode=packet-up&path=/test/',
            'XRAY_USER_UUID': 'base', 'XRAY_REALITY_PUBLIC_KEY': 'unused'})
        self.env.start()
        self.addCleanup(self.env.stop)

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control')
    def test_fresh_config_differs_only_in_local_port_and_always_stops(self, control, start, stop):
        fresh = Mock()
        fresh.poll.return_value = None
        start.return_value = fresh
        control.side_effect = OSError('private-detail')
        with patch('probe.emit') as emit:
            probe.fresh_xhttp_exit_control('test', None, 'round')
        config = start.call_args.args[0]
        expected, _ = probe.client_config(os.environ['XHTTP_PROFILE_LINK'], 'base', 'unused', port=1082)
        expected['log']['loglevel'] = 'info'
        config['inbounds'][0]['port'] = 1082
        self.assertEqual(config, expected)
        control.assert_called_once_with('test', 'socks5h://127.0.0.1:1083', 'round', check='diagnostic_fresh_trace')
        stop.assert_called_once_with(fresh)
        self.assertFalse(emit.call_args.args[3]['ok'])
        self.assertNotIn('private-detail', str(emit.call_args))

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control')
    def test_cancel_after_start_stops_fresh_without_request(self, control, start, stop):
        with patch('probe.STOP') as stopping:
            stopping.is_set.side_effect = [False, True]
            probe.fresh_xhttp_exit_control('test', None, 'round')
        control.assert_not_called()
        stop.assert_called_once_with(start.return_value)

    @patch('probe.emit')
    @patch('probe.start_client', side_effect=RuntimeError('private-detail'))
    @patch('probe.xhttp_exit_control')
    def test_failed_start_is_labelled_and_does_not_stop_baseline(self, control, start, emit):
        baseline = Mock()
        baseline.poll.return_value = None
        probe.fresh_xhttp_exit_control('test', baseline, 'round')
        control.assert_not_called()
        self.assertEqual(emit.call_args.args[1], 'diagnostic_fresh_trace')
        self.assertFalse(emit.call_args.args[3]['ok'])
        self.assertNotIn('private-detail', str(emit.call_args))
        baseline.terminate.assert_not_called()

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control')
    def test_parent_failure_still_invalidates_round_and_cleans_up(self, control, start, stop):
        baseline = Mock()
        baseline.poll.return_value = 1
        with patch('probe.emit'):
            with self.assertRaisesRegex(RuntimeError, 'client_exited'):
                probe.fresh_xhttp_exit_control('test', baseline, 'round')
        stop.assert_called_once_with(start.return_value)
        control.assert_not_called()

    @patch('probe.start_client')
    def test_already_cancelled_diagnostic_starts_nothing(self, start):
        with patch('probe.STOP') as stopping:
            stopping.is_set.return_value = True
            probe.fresh_xhttp_exit_control('test', None, 'round')
        start.assert_not_called()

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control', return_value=True)
    def test_native_tls_only_changes_fingerprint_and_metric_label(self, control, start, stop):
        start.return_value.poll.return_value = None
        self.assertTrue(probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True))
        expected, _ = probe.client_config(os.environ['XHTTP_PROFILE_LINK'], 'base', 'unused', port=1083)
        expected['log']['loglevel'] = 'info'
        expected['outbounds'][0]['streamSettings']['tlsSettings']['fingerprint'] = 'unsafe'
        self.assertEqual(start.call_args.args[0], expected)
        control.assert_called_once_with('test', 'socks5h://127.0.0.1:1083', 'round', check='diagnostic_native_trace')
        stop.assert_called_once_with(start.return_value)

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control', return_value=True)
    def test_native_http1_changes_only_alpn_and_separate_check(self, control, start, stop):
        start.return_value.poll.return_value = None
        self.assertTrue(probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True))
        h2 = start.call_args.args[0]
        self.assertTrue(probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True, http1=True))
        h1 = start.call_args.args[0]
        h2['outbounds'][0]['streamSettings']['tlsSettings']['alpn'] = ['http/1.1']
        self.assertEqual(h1, h2)
        self.assertFalse(h1['outbounds'][0]['streamSettings']['tlsSettings']['allowInsecure'])
        self.assertEqual(control.call_args.kwargs['check'], 'diagnostic_native_h1_trace')
        self.assertEqual(stop.call_count, 2)

    @patch('probe.start_client')
    def test_http1_without_native_tls_is_rejected_before_start(self, start):
        with self.assertRaises(ValueError):
            probe.fresh_xhttp_exit_control('test', None, 'round', http1=True)
        start.assert_not_called()

    @patch('probe.h1_transfer_controls')
    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control', return_value=False)
    def test_payloads_require_successful_exit_on_the_same_client(self, control, start, stop, sizes):
        start.return_value.poll.return_value = None
        self.assertFalse(probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True,
                                                       http1=True, measure_sizes=True))
        sizes.assert_not_called()
        stop.assert_called_once_with(start.return_value)
        self.assertEqual(control.call_args.kwargs['check'], 'diagnostic_h1_size_exit')

    @patch('probe.h1_transfer_controls', return_value=False)
    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control', return_value=True)
    def test_payload_failure_stops_fresh_client_and_fails_control(self, control, start, stop, sizes):
        start.return_value.poll.return_value = None
        self.assertFalse(probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True,
                                                       http1=True, measure_sizes=True))
        self.assertEqual(sizes.call_args.kwargs['fresh'], start.return_value)
        stop.assert_called_once_with(start.return_value)

    @patch('probe.h1_transfer_controls', return_value=True)
    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control')
    def test_immediate_payload_requires_own_exit_and_cleans_up(self, control, start, stop, sizes):
        start.return_value.poll.return_value = None
        for size in [4096, 16384, 8192]:
            for accepted in [False, True]:
                with self.subTest(size=size, accepted=accepted):
                    control.return_value = accepted
                    sizes.reset_mock()
                    self.assertEqual(probe.fresh_xhttp_exit_control('test', None, 'round',
                        native_tls=True, http1=True, payload_size=size), accepted)
                    expected = 'diagnostic_h1_fresh_size_exit' + (f'_{size}' if size != 4096 else '')
                    self.assertEqual(control.call_args.kwargs['check'], expected)
                    if accepted:
                        self.assertEqual(sizes.call_args.kwargs['immediate_size'], size)
                        self.assertIs(sizes.call_args.kwargs['fresh'], start.return_value)
                    else:
                        sizes.assert_not_called()
        self.assertEqual(stop.call_count, 6)

    @patch('probe.start_client')
    def test_conflicting_payload_modes_are_rejected_before_startup(self, start):
        with self.assertRaises(ValueError):
            probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True,
                http1=True, measure_sizes=True, payload_size=4096)
        start.assert_not_called()


    @patch('probe.start_client')
    def test_unbounded_or_non_h1_fresh_sizes_rejected_before_start(self, start):
        for size in [0, True, 65536, -1]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True,
                                              http1=True, payload_size=size)
        with self.assertRaises(ValueError):
            probe.fresh_xhttp_exit_control('test', None, 'round', native_tls=True, payload_size=16384)
        start.assert_not_called()

    @patch('probe.h1_transfer_controls', return_value=True)
    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.xhttp_exit_control', return_value=True)
    def test_fresh_sizes_use_distinct_cleaned_up_processes(self, control, start, stop, sizes):
        first, second, third = Mock(), Mock(), Mock()
        first.poll.return_value = second.poll.return_value = third.poll.return_value = None
        start.side_effect = [first, second, third]
        for size in [4096, 16384, 8192]:
            self.assertTrue(probe.fresh_xhttp_exit_control('test', None, 'round',
                native_tls=True, http1=True, payload_size=size))
        self.assertEqual([c.args[0] for c in stop.call_args_list], [first, second, third])
        self.assertEqual([c.kwargs['fresh'] for c in sizes.call_args_list], [first, second, third])
