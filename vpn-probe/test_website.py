import json
import os
import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import mock_open, patch

from metrics import ProbeMetrics
import probe


class WebsiteTests(unittest.TestCase):
    @patch('probe.subprocess.run')
    def test_head_is_direct_verified_bounded_and_ignores_page_body_length(self, run):
        run.return_value = subprocess.CompletedProcess([], 0,
            json.dumps({'http_code': 200, 'size_download': 0, 'size_header': 1200}), '')
        result, body = probe.request('https://senaev.ru/', '', 0, head=True)
        command = run.call_args.args[0]
        self.assertIn('--head', command)
        self.assertEqual(command[command.index('--output') + 1], os.devnull)
        self.assertEqual(command[command.index('--proxy') + 1], '')
        self.assertEqual(command[command.index('--noproxy') + 1], '')
        self.assertEqual(command[command.index('--connect-timeout') + 1], '3')
        self.assertEqual(command[command.index('--max-time') + 1], '8')
        self.assertEqual(run.call_args.kwargs['timeout'], 10)
        for flag in ['--max-filesize', '--location', '--retry', '--insecure']:
            self.assertNotIn(flag, command)
        self.assertTrue(result['ok'])
        self.assertEqual(result['bytes'], 0)
        self.assertEqual(body, '')

    @patch('probe.subprocess.run')
    def test_head_redirect_server_error_and_tls_failure_are_not_availability(self, run):
        for exit_code, status in [(0, 302), (22, 503), (60, 0), (28, 0)]:
            with self.subTest(exit_code=exit_code, status=status):
                run.return_value = subprocess.CompletedProcess([], exit_code,
                    json.dumps({'http_code': status}), 'private error')
                result, body = probe.request('https://senaev.ru/', '', 0, head=True)
                self.assertFalse(result['ok'])
                self.assertEqual(result['curl_exit'], exit_code)
                self.assertNotIn('private', str(result))
                self.assertEqual(body, '')

    @patch('probe.request', side_effect=[({'ok': False, 'curl_exit': 28}, ''),
                                       ({'ok': True, 'http_status': 200}, '')])
    @patch('probe.emit')
    @patch('probe.STOP')
    def test_failure_is_recorded_and_next_check_continues_with_jitter(self, stopping, emit, request):
        stopping.is_set.return_value = False
        stopping.wait.side_effect = [False, True]
        probe.website_loop('home')
        self.assertEqual(request.call_count, 2)
        for call in request.call_args_list:
            self.assertEqual(call.args, ('https://senaev.ru/', '', 0))
            self.assertEqual(call.kwargs, {'head': True})
        self.assertEqual([c.args[3]['ok'] for c in emit.call_args_list], [False, True])
        self.assertTrue(all(c.args[:3] == ('home', 'website_senaev_ru', 'direct')
                            for c in emit.call_args_list))
        self.assertTrue(all(30 <= c.args[0] <= 45 for c in stopping.wait.call_args_list))

    @patch('probe.request')
    @patch('probe.STOP')
    def test_stopped_worker_sends_nothing(self, stopping, request):
        stopping.is_set.return_value = True
        probe.website_loop('home')
        request.assert_not_called()

    @patch('probe.request', return_value=({'ok': True}, ''))
    @patch('probe.emit')
    @patch('probe.STOP')
    def test_stop_after_request_does_not_publish_a_new_sample(self, stopping, emit, request):
        stopping.is_set.side_effect = [False, True]
        probe.website_loop('home')
        emit.assert_not_called()
        stopping.wait.assert_not_called()

    @patch('probe.request', return_value=({'ok': False, 'http_status': 0, 'curl_exit': 28}, ''))
    @patch('probe.STOP')
    def test_real_emit_exports_website_failure_with_freshness_and_status(self, stopping, request):
        stopping.is_set.return_value = False
        stopping.wait.return_value = True
        metrics = ProbeMetrics()
        with patch('probe.METRICS', metrics), patch('builtins.print'):
            probe.website_loop('home')
        text = metrics.render()
        labels = 'profile="home",check="website_senaev_ru",route="direct"'
        self.assertIn(f'vpn_probe_success{{{labels}}} 0', text)
        self.assertIn(f'vpn_probe_curl_exit_code{{{labels}}} 28', text)
        self.assertIn(f'vpn_probe_http_status_code{{{labels}}} 0', text)
        self.assertIn(f'vpn_probe_last_check_timestamp_seconds{{{labels}}}', text)


class WebsiteLifecycleTests(unittest.TestCase):
    @patch.dict(os.environ, {'WEBSITE_CHECK': 'true', 'PROFILE_NAME': 'home'})
    @patch('probe.argparse.ArgumentParser.parse_args', return_value=SimpleNamespace(once=False, invalid=False))
    @patch('probe.signal.signal')
    @patch('probe.start_server')
    @patch('probe.threading.Thread')
    @patch('probe.STOP')
    @patch('probe.run', side_effect=RuntimeError('vpn startup failed'))
    def test_vpn_failure_stops_and_joins_worker_before_closing_metrics(self, run, stopping, thread, server, signal, args):
        with self.assertRaisesRegex(RuntimeError, 'vpn startup failed'):
            probe.main()
        thread.assert_called_once_with(target=probe.website_loop, args=('home',), daemon=True)
        thread.return_value.start.assert_called_once()
        stopping.set.assert_called_once()
        thread.return_value.join.assert_called_once_with(timeout=11)
        server.return_value.shutdown.assert_called_once()
        server.return_value.server_close.assert_called_once()

    @patch.dict(os.environ, {'WEBSITE_CHECK': 'true'})
    @patch('probe.argparse.ArgumentParser.parse_args', return_value=SimpleNamespace(once=True, invalid=False))
    @patch('probe.signal.signal')
    @patch('probe.fcntl.flock')
    @patch('builtins.open', new_callable=mock_open)
    @patch('probe.start_server')
    @patch('probe.threading.Thread')
    @patch('probe.run', return_value=0)
    def test_manual_once_starts_no_background_checks(self, run, thread, server, opened, flock, signal, args):
        self.assertEqual(probe.main(), 0)
        thread.assert_not_called()
        server.assert_not_called()
