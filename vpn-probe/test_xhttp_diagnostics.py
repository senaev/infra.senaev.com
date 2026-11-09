import json
import subprocess
import unittest
from unittest.mock import patch

import probe
from xhttp_server import server_config


class DiagnosticTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.xhttp_exit_control', return_value=True)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_controls_are_bounded_serial_and_long_trace_is_separate(self, request, exit_control, wait, emit):
        probe.xhttp_response_diagnostics('test', 'baseline', 'candidate', None, 'round')
        self.assertEqual([x.args[1] for x in request.call_args_list],
                         ['', 'baseline', 'candidate', 'candidate'])
        self.assertEqual(wait.call_count, 3)
        self.assertTrue(all(60 <= x.args[0] <= 90 for x in wait.call_args_list))
        exit_control.assert_called_once_with('test', 'candidate', 'round',
                                             timeout=30, check='diagnostic_trace_30s')
        self.assertEqual(request.call_args_list[-1].kwargs['expected_bytes'], 256)
        self.assertEqual(request.call_args_list[-1].args[2], 256)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=True)
    @patch('probe.xhttp_exit_control')
    @patch('probe.request', return_value=({'ok': False}, ''))
    def test_shutdown_during_quiet_wait_stops_candidate_requests(self, request, exit_control, wait, emit):
        probe.xhttp_response_diagnostics('test', 'baseline', 'candidate', None, 'round')
        self.assertEqual(request.call_count, 2)
        exit_control.assert_not_called()

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.xhttp_exit_control', side_effect=[False, True])
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_long_diagnostic_success_does_not_promote_failed_candidate(self, request, exit_control, wait, emit):
        self.assertFalse(probe.transfer_round('test', 'baseline', xhttp_proxy='candidate', diagnostics=True))
        self.assertEqual(exit_control.call_count, 2)
        self.assertEqual(request.call_count, 22)
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
