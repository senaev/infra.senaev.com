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
                               ({'ok':True}, 'ip=3.3.3.3'), ({'ok':True}, '')]
        self.assertFalse(probe.heavy('test', 'socks5h://127.0.0.1:1080', 'senaev.com'))
        self.assertFalse(emit.call_args_list[1].args[3]['ok'])


if __name__ == '__main__':
    unittest.main()
