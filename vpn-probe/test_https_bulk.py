import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from metrics import ProbeMetrics
import probe


PAGE = '<script src="/_next/static/chunks/small.js"></script><script src="/_next/static/chunks/large.js"></script>'


class HTTPSBulkTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_selects_large_asset_and_keeps_testing_after_failure(self, request, wait, emit):
        request.side_effect = [({'ok': True}, PAGE), ({'ok': True, 'content_length': 1000}, ''),
            ({'ok': True, 'content_length': 100000}, ''), ({'ok': True}, ''),
            ({'ok': False}, ''), ({'ok': True}, '')]
        self.assertFalse(probe.https_bulk_controls('test'))
        self.assertEqual(request.call_count, 6)
        self.assertEqual(request.call_args_list[0].kwargs, {"text_limit": 65536, "http1": True})
        self.assertTrue(all(c.kwargs == {"head": True, "http1": True}
                            for c in request.call_args_list[1:3]))
        for call, size in zip(request.call_args_list[3:], [8192, 16384, 65536]):
            self.assertEqual(call.args, ('https://senaev.com/_next/static/chunks/large.js', '', size))
            self.assertEqual(call.kwargs, {'expected_status': 206, 'expected_bytes': size, 'range_bytes': size})
        self.assertEqual([x.args[1] for x in emit.call_args_list], ['https_bulk_discovery',
            'transfer_https_hetzner_8192', 'transfer_https_hetzner_16384', 'transfer_https_hetzner_65536'])
        self.assertTrue(60 <= wait.call_args_list[0].args[0] <= 90)
        self.assertTrue(all(2 <= x.args[0] <= 7 for x in wait.call_args_list[1:]))

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_discovery_failure_and_foreign_asset_send_no_ranges(self, request, wait, emit):
        for result, page in [({'ok': False}, PAGE), ({'ok': True}, '<script src="https://other.test/a.js"></script>')]:
            request.reset_mock()
            request.return_value = result, page
            self.assertFalse(probe.https_bulk_controls('test'))
            request.assert_called_once()
            self.assertFalse(emit.call_args.args[3]['ok'])

    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False, False, True])
    @patch('probe.request', side_effect=[({'ok': True}, PAGE),
        ({'ok': True, 'content_length': 100000}, '')])
    def test_stop_after_discovery_sends_no_payload(self, request, wait, emit):
        self.assertFalse(probe.https_bulk_controls('test'))
        self.assertEqual(request.call_count, 2)
        self.assertEqual(emit.call_count, 1)

    @patch('probe.subprocess.run')
    def test_real_request_options_reject_ignored_range_and_short_body(self, run):
        for status, size, expected in [(206, 8192, True), (200, 8192, False), (206, 4096, False)]:
            def curl(command, **kwargs):
                Path(command[command.index('--output') + 1]).write_bytes(b'x' * size)
                return subprocess.CompletedProcess(command, 0, json.dumps({'http_code': status}), '')
            run.side_effect = curl
            result, _ = probe.request('https://senaev.com/asset', '', 8192,
                expected_status=206, expected_bytes=8192, range_bytes=8192)
            self.assertEqual(result['ok'], expected)
            command = run.call_args.args[0]
            self.assertIn('--http1.1', command)
            self.assertEqual(command[command.index('--range') + 1], '0-8191')
            self.assertEqual(command[command.index('--max-filesize') + 1], '8192')
            for flag in ['--location', '--retry', '--insecure', '--compressed']:
                self.assertNotIn(flag, command)

    @patch('probe.subprocess.run')
    def test_head_reads_metadata_without_downloading_asset(self, run):
        def curl(command, **kwargs):
            Path(command[command.index('--dump-header') + 1]).write_text('HTTP/2 200\r\nContent-Length: 100000\r\n\r\n')
            return subprocess.CompletedProcess(command, 0, '{"http_code":200}', '')
        run.side_effect = curl
        result, _ = probe.request('https://senaev.com/asset', '', 0, head=True)
        self.assertEqual(result['content_length'], 100000)
        self.assertTrue(result['ok'])
        self.assertIn('--head', run.call_args.args[0])

    def test_control_results_are_exported_with_fixed_names(self):
        metrics = ProbeMetrics()
        for name in ['https_bulk_discovery', 'transfer_https_hetzner_8192',
                     'transfer_https_hetzner_16384', 'transfer_https_hetzner_65536']:
            metrics.record('test', name, 'direct', {'ok': True})
        self.assertEqual(len(metrics.results), 4)

    @patch('probe.emit')
    @patch('probe.https_bulk_controls', return_value=False)
    @patch('probe.transfer_round', return_value=False)
    @patch('probe.experiment_wait', return_value=False)
    def test_failed_vpn_does_not_suppress_control_or_become_success(self, wait, vpn, bulk, emit):
        self.assertEqual(probe.experiment_loop('home', 'proxy', once=True, diagnostics=True), 1)
        bulk.assert_called_once_with('home', None)

    @patch('probe.subprocess.run')
    def test_http1_flag_and_negotiated_version_are_explicit_and_other_checks_unchanged(self, run):
        for force, version in [(False, '2'), (True, '1.1')]:
            run.return_value = subprocess.CompletedProcess([], 0,
                json.dumps({'http_code': 200, 'http_version': version}), '')
            result, _ = probe.request('https://senaev.com/', '', 65536, http1=force)
            self.assertEqual('--http1.1' in run.call_args.args[0], force)
            self.assertEqual(result['http_version'], version)
            for flag in ['--insecure', '--location', '--retry']:
                self.assertNotIn(flag, run.call_args.args[0])
        run.return_value = subprocess.CompletedProcess([], 28,
            json.dumps({'http_code': 0, 'http_version': '0'}), '')
        result, _ = probe.request('https://senaev.com/', '', 65536, http1=True)
        self.assertFalse(result['ok'])
        self.assertNotIn('http_version', result)
