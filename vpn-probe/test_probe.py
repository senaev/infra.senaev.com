import hashlib
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch, Mock
import uuid

import probe

LINK = ('vless://{XRAY_USER_UUID:4}@senaev.ru:443?type=tcp&security=reality'
        '&flow=xtls-rprx-vision&fp=chrome&sni=senaev.ru&pbk={XRAY_REALITY_PUBLIC_KEY}&sid=')


class ConfigTests(unittest.TestCase):
    def test_matches_server_uuid_and_has_no_direct_outbound(self):
        config, seed = probe.client_config(LINK, 'base', 'public')
        expected = str(uuid.UUID(hashlib.sha256(b'base:4').hexdigest()[:32]))
        outbound = config['outbounds'][0]
        self.assertEqual(seed, '4')
        self.assertEqual(outbound['settings']['vnext'][0]['users'][0]['id'], expected)
        self.assertEqual([x['protocol'] for x in config['outbounds']], ['vless'])
        self.assertEqual(config['inbounds'][0]['listen'], '127.0.0.1')
        self.assertEqual(outbound['streamSettings']['realitySettings']['password'], 'public')

    def test_ipv6_literal_is_preserved(self):
        config, _ = probe.client_config(LINK.replace('senaev.ru:443', '[2001:db8::1]:443'), 'b', 'p')
        self.assertEqual(config['outbounds'][0]['settings']['vnext'][0]['address'], '2001:db8::1')

    def test_invalid_credentials_only_change_uuid(self):
        good, _ = probe.client_config(LINK, 'base', 'public')
        bad, _ = probe.client_config(LINK, 'base', 'public', invalid=True)
        good_user = good['outbounds'][0]['settings']['vnext'][0]['users'][0]
        bad_user = bad['outbounds'][0]['settings']['vnext'][0]['users'][0]
        self.assertNotEqual(good_user['id'], bad_user['id'])
        bad_user['id'] = good_user['id']
        self.assertEqual(good, bad)

    def test_rejects_unimplemented_transport_and_missing_macro(self):
        for link in [LINK.replace('type=tcp', 'type=xhttp'), LINK.replace('{XRAY_USER_UUID:4}', 'literal')]:
            with self.assertRaises(ValueError):
                probe.client_config(link, 'b', 'p')


class RequestTests(unittest.TestCase):
    @patch('probe.subprocess.run')
    def test_explicit_proxy_no_bypass_and_partial_body_rejected(self, run):
        def response(command, **kwargs):
            Path(command[command.index('--output') + 1]).write_bytes(b'abc')
            self.assertEqual(command[:2], ['curl', '--disable'])
            self.assertEqual(command[command.index('--proxy')+1], 'socks5h://127.0.0.1:1080')
            self.assertEqual(command[command.index('--noproxy')+1], '')
            self.assertNotIn('--location', command)
            self.assertNotIn('--retry', command)
            self.assertEqual(kwargs['timeout'], 10)
            self.assertFalse(any(k.lower().endswith('_proxy') for k in kwargs['env']))
            return subprocess.CompletedProcess(command, 0, json.dumps({'http_code':200}), '')
        run.side_effect = response
        result, _ = probe.request('https://example.test', 'socks5h://127.0.0.1:1080', 65536, expected_bytes=65536)
        self.assertFalse(result['ok'])
        self.assertEqual(result['bytes'], 3)
        self.assertEqual(run.call_count, 1)

    @patch('probe.subprocess.run')
    def test_timeout_and_http_redirect_are_failures(self, run):
        run.side_effect = subprocess.TimeoutExpired('curl', 10)
        result, _ = probe.request('https://example.test', '', 4096)
        self.assertFalse(result['ok'])
        run.side_effect = None
        run.return_value = subprocess.CompletedProcess([], 0, '{"http_code":302}', '')
        result, _ = probe.request('https://example.test', '', 4096)
        self.assertFalse(result['ok'])

    def test_trace_validation(self):
        self.assertEqual(probe.trace_ip('foo=bar\nip=1.2.3.4\n'), '1.2.3.4')
        for value in ['ip=not-an-ip', 'loc=ES']:
            with self.assertRaises(ValueError):
                probe.trace_ip(value)


class ControlTests(unittest.TestCase):
    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.emit')
    @patch('probe.request')
    def test_negative_requires_working_positive_control(self, request, emit, start, stop):
        request.return_value = ({'ok':False}, '')
        self.assertEqual(probe.negative('test', LINK, 'b', 'p', '/tmp'), 1)
        self.assertEqual(start.call_count, 1)
        self.assertEqual(emit.call_args.args[3]['failure'], 'positive_control_failed')

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.emit')
    @patch('probe.request')
    def test_negative_detects_unexpected_success(self, request, emit, start, stop):
        request.return_value = ({'ok':True}, '')
        self.assertEqual(probe.negative('test', LINK, 'b', 'p', '/tmp'), 1)
        self.assertEqual(start.call_count, 2)
        self.assertFalse(emit.call_args.args[3]['rejected'])

    @patch('probe.resolve_exit', return_value={'2.2.2.2'})
    @patch('probe.emit')
    @patch('probe.request')
    def test_wrong_exit_is_not_a_success(self, request, emit, resolve):
        request.side_effect = [({'ok':True}, 'ip=1.1.1.1'),
                               ({'ok':True}, 'ip=3.3.3.3')] + [({'ok':True}, '')] * 4
        self.assertFalse(probe.heavy('test', 'socks5h://127.0.0.1:1080', 'senaev.com'))
        self.assertFalse(emit.call_args_list[1].args[3]['ok'])


class ReviewRegressionTests(unittest.TestCase):
    @patch('probe.resolve_exit', return_value={'2.2.2.2'})
    @patch('probe.emit')
    @patch('probe.request')
    def test_failed_direct_trace_fails_entire_round(self, request, emit, resolve):
        request.side_effect = [({'ok':False}, ''),
                               ({'ok':True}, 'ip=2.2.2.2')] + [({'ok':True}, '')] * 4
        self.assertFalse(probe.heavy('test', 'socks5h://127.0.0.1:1080', 'senaev.com'))

    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.emit')
    @patch('probe.request')
    def test_invalid_timeout_or_http_failure_is_inconclusive(self, request, emit, start, stop):
        for failure in [{'ok':False, 'curl_exit':28, 'http_status':0},
                        {'ok':False, 'curl_exit':22, 'http_status':503}]:
            request.side_effect = [({'ok':True}, ''), (failure, '')]
            self.assertEqual(probe.negative('test', LINK, 'b', 'p', '/tmp'), 2)
            self.assertEqual(emit.call_args.args[3]['outcome'], 'inconclusive')
            self.assertFalse(emit.call_args.args[3]['rejected'])


class DiagnosticTests(unittest.TestCase):
    @patch('probe.subprocess.run')
    def test_long_request_has_bounded_curl_and_process_timeouts(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, '{"http_code":200}', '')
        probe.request('https://example.test', '', 65536, timeout=30)
        args = run.call_args.args[0]
        self.assertEqual(args[args.index('--max-time') + 1], '30')
        self.assertEqual(run.call_args.kwargs['timeout'], 32)
        self.assertEqual(args[args.index('--max-filesize') + 1], '65536')

    @patch('probe.resolve_exit', return_value={'2.2.2.2'})
    @patch('probe.emit')
    @patch('probe.request')
    def test_download_controls_keep_short_failure_when_long_passes(self, request, emit, resolve):
        request.side_effect = [
            ({'ok':True}, 'ip=1.1.1.1'), ({'ok':True}, 'ip=2.2.2.2'),
            ({'ok':True}, ''), ({'ok':False}, ''),
            ({'ok':True}, ''), ({'ok':True}, '')]
        self.assertFalse(probe.heavy('test', 'socks5h://127.0.0.1:1080', 'senaev.com'))
        downloads = request.call_args_list[2:]
        self.assertEqual([x.args[1] for x in downloads],
                         ['', 'socks5h://127.0.0.1:1080'] * 2)
        self.assertEqual([x.kwargs['timeout'] for x in downloads], [8, 8, 30, 30])
        self.assertEqual([x.args[1] for x in emit.call_args_list[2:]],
                         ['download_64k', 'download_64k', 'download_64k_30s', 'download_64k_30s'])

    @patch('probe.resolve_exit', return_value={'2.2.2.2'})
    @patch('probe.emit')
    @patch('probe.request')
    def test_failed_direct_bulk_control_fails_round_even_when_vpn_passes(self, request, emit, resolve):
        request.side_effect = [
            ({'ok':True}, 'ip=1.1.1.1'), ({'ok':True}, 'ip=2.2.2.2'),
            ({'ok':False}, ''), ({'ok':True}, ''),
            ({'ok':True}, ''), ({'ok':True}, '')]
        self.assertFalse(probe.heavy('test', 'socks5h://127.0.0.1:1080', 'senaev.com'))

    @patch('probe.light', return_value=True)
    @patch('probe.time.monotonic', side_effect=[0, 31, 31, 32, 62, 62, 63])
    @patch('probe.resolve_exit', return_value={'2.2.2.2'})
    @patch('probe.emit')
    @patch('probe.request')
    def test_light_checks_refresh_during_long_round(self, request, emit, resolve, monotonic, light):
        request.side_effect = [
            ({'ok':True}, 'ip=1.1.1.1'), ({'ok':True}, 'ip=2.2.2.2')
        ] + [({'ok':True}, '')] * 4
        self.assertTrue(probe.heavy('test', 'socks5h://127.0.0.1:1080', 'senaev.com'))
        self.assertEqual(light.call_count, 2)

    @patch('probe.emit')
    @patch('probe.socket.socket')
    def test_ipv6_controls_distinguish_unreachable_entry_from_working_control(self, socket, emit):
        connection = socket.return_value.__enter__.return_value
        connection.connect.side_effect = [OSError(101, 'unreachable'), None]
        probe.ipv6_controls('test', '2001:db8::1')
        self.assertEqual(connection.settimeout.call_args_list[0].args, (3,))
        first, second = emit.call_args_list
        self.assertEqual(first.args[1:3], ('ipv6_entry', 'direct'))
        self.assertFalse(first.args[3]['ok'])
        self.assertEqual(first.args[3]['errno'], 101)
        self.assertEqual(second.args[1:3], ('ipv6_control', 'direct'))
        self.assertTrue(second.args[3]['ok'])


class TransferTests(unittest.TestCase):
    @patch('probe.random.uniform', side_effect=lambda low, high: (low + high) / 2)
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_exact_sizes_targets_routes_and_quiet_intervals(self, request, wait, emit, uniform):
        self.assertTrue(probe.transfer_round('test', 'proxy'))
        calls = request.call_args_list
        self.assertEqual(len(calls), 18)
        self.assertEqual(wait.call_count, 11)
        self.assertEqual(sum(c.args[0] == 75 for c in wait.call_args_list), 5)
        self.assertEqual(sum(c.args[0] == 4.5 for c in wait.call_args_list), 6)
        self.assertEqual(sum(c.args == (60, 90) for c in uniform.call_args_list), 5)
        self.assertEqual(sum(c.args == (2, 7) for c in uniform.call_args_list), 6)
        for index, size in enumerate([4096, 4096, 16384, 16384, 65536, 65536]):
            direct, before, vpn = calls[index * 3:index * 3 + 3]
            self.assertEqual(direct.args[1:], ('', size))
            self.assertEqual(vpn.args[1:], ('proxy', size))
            self.assertEqual(direct.args[0], vpn.args[0])
            self.assertEqual(direct.kwargs['expected_bytes'], size)
            self.assertEqual(before.kwargs['expected_status'], 204)
        self.assertEqual(len({c.args[3]['experiment_id'] for c in emit.call_args_list}), 1)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_condition_rotation(self, request, wait, emit):
        probe.transfer_round('test', 'proxy', rotation=1)
        self.assertEqual(request.call_args_list[0].args[0], 'https://httpbingo.org/bytes/4096')
        self.assertEqual(request.call_args_list[-1].args[0], 'https://speed.cloudflare.com/__down?bytes=4096')

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_failed_direct_control_marks_comparison_inconclusive_and_continues(self, request, wait, emit):
        request.side_effect = [({'ok': False}, '')] + [({'ok': True}, '')] * 17
        self.assertFalse(probe.transfer_round('test', 'proxy'))
        result = emit.call_args_list[3].args[3]
        self.assertTrue(result['ok'])
        self.assertTrue(result['comparison_inconclusive'])
        self.assertEqual(request.call_count, 18)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_failed_positive_control_skips_only_its_transfer(self, request, wait, emit):
        request.side_effect = [({'ok': True}, ''), ({'ok': False}, '')] + [({'ok': True}, '')] * 15
        self.assertFalse(probe.transfer_round('test', 'proxy'))
        self.assertEqual(request.call_count, 17)
        self.assertEqual(emit.call_args_list[3].args[1], 'transfer_skipped')

    @patch('probe.experiment_wait', side_effect=lambda *args: probe.STOP.is_set())
    @patch('probe.emit')
    @patch('probe.request')
    def test_shutdown_during_request_prevents_more_requests(self, request, emit, wait):
        import threading
        for halt_at in [1, 2, 3]:
            with self.subTest(halt_at=halt_at):
                request.reset_mock()
                stop = threading.Event()
                def fetch(*args, **kwargs):
                    if request.call_count == halt_at:
                        stop.set()
                    return {'ok': True}, ''
                request.side_effect = fetch
                with patch('probe.STOP', stop):
                    self.assertFalse(probe.transfer_round('test', 'proxy'))
                self.assertEqual(request.call_count, halt_at)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=True)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_shutdown_in_quiet_interval_stops_remaining_conditions(self, request, wait, emit):
        self.assertFalse(probe.transfer_round('test', 'proxy'))
        self.assertEqual(request.call_count, 2)

    @patch('probe.emit')
    @patch('probe.request')
    def test_child_exit_invalidates_cycle(self, request, emit):
        child = Mock()
        child.poll.return_value = None
        def fetch(*args, **kwargs):
            child.poll.return_value = 1
            return {'ok': True}, ''
        request.side_effect = fetch
        with self.assertRaisesRegex(RuntimeError, 'client_exited'):
            probe.transfer_round('test', 'proxy', child=child)
        self.assertTrue(emit.call_args.args[3]['cycle_invalid'])
        self.assertEqual(emit.call_args.args[1], 'experiment_client_alive')

    @patch('probe.emit')
    def test_child_exit_mid_wait_preserves_cycle_id(self, emit):
        child = Mock()
        child.poll.side_effect = [None, 1]
        stop = Mock()
        stop.is_set.return_value = False
        stop.wait.return_value = False
        with patch('probe.STOP', stop):
            with self.assertRaisesRegex(RuntimeError, 'client_exited'):
                probe.experiment_wait(60, child, 'test', 'cycle-one')
        stop.wait.assert_called_once_with(1)
        self.assertEqual(emit.call_args.args[3]['experiment_id'], 'cycle-one')

    @patch('probe.random.uniform', return_value=330)
    @patch('probe.transfer_round', return_value=True)
    def test_quiet_start_once_and_graceful_shutdown(self, run_round, uniform):
        stop = Mock()
        stop.is_set.return_value = False
        stop.wait.return_value = False
        with patch('probe.STOP', stop):
            self.assertEqual(probe.experiment_loop('test', 'proxy', once=True), 0)
        stop.wait.assert_called_once_with(330)
        uniform.assert_called_once_with(300, 360)
        stop.wait.return_value = True
        with patch('probe.STOP', stop):
            self.assertEqual(probe.experiment_loop('test', 'proxy'), 0)
            self.assertEqual(probe.experiment_loop('test', 'proxy', once=True), 1)


if __name__ == '__main__':
    unittest.main()
