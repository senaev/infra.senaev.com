import unittest
import os
from unittest.mock import Mock, patch

import probe
from metrics import ProbeMetrics
from xhttp_server import server_config

LINK = ("vless://{XRAY_USER_UUID:xhttp-probe}@senaev.com:443?"
        "type=xhttp&security=tls&fp=chrome&sni=senaev.com&mode=packet-up&path=/_vpn-xhttp-test/")


class XhttpTests(unittest.TestCase):
    def test_client_and_backend_credentials_match_without_vision_or_tls_bypass(self):
        config, seed = probe.client_config(LINK, "base", "unused", port=1082)
        server = server_config("base", "/_vpn-xhttp-test/")
        outbound = config["outbounds"][0]
        user = outbound["settings"]["vnext"][0]["users"][0]
        self.assertEqual(user["id"], server["inbounds"][0]["settings"]["clients"][0]["id"])
        self.assertEqual(seed, "xhttp-probe")
        self.assertNotIn("flow", user)
        self.assertEqual(config["inbounds"][0]["listen"], "127.0.0.1")
        self.assertEqual(outbound["streamSettings"]["tlsSettings"]["alpn"], ["h2"])
        self.assertFalse(outbound["streamSettings"]["tlsSettings"]["allowInsecure"])
        self.assertEqual(outbound["streamSettings"]["xhttpSettings"]["extra"]["xmux"]["maxConnections"], 1)
        self.assertEqual([x["protocol"] for x in config["outbounds"]], ["vless"])

    def test_rejects_unimplemented_xhttp_combinations(self):
        for link in [LINK + "&flow=xtls-rprx-vision", LINK.replace("packet-up", "stream-up"),
                     LINK.replace("security=tls", "security=none"),
                     LINK.replace("path=/_vpn-xhttp-test/", "path=bad")]:
            with self.assertRaises(ValueError):
                probe.client_config(link, "base", "unused")

    @patch('probe.resolve_exit', return_value={'1.2.3.4'})
    @patch('probe.emit')
    @patch('probe.request', return_value=({'ok': True}, 'ip=4.3.2.1'))
    def test_wrong_candidate_exit_fails_control(self, request, emit, resolve):
        self.assertFalse(probe.xhttp_exit_control('test', 'candidate', 'round'))
        self.assertEqual(emit.call_args.args[1:3], ('exit_ip', 'xhttp'))
        self.assertFalse(emit.call_args.args[3]['ok'])

    @patch('probe.xhttp_exit_control', return_value=True)
    @patch('probe.random.uniform', return_value=75)
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.emit')
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_variants_run_serially_and_alternate_order(self, request, emit, wait, uniform, exit_control):
        self.assertTrue(probe.transfer_round('test', 'baseline', xhttp_proxy='candidate'))
        self.assertEqual(request.call_count, 30)
        self.assertEqual(wait.call_count, 11)
        first = [c.args[1] for c in request.call_args_list[:5]]
        second = [c.args[1] for c in request.call_args_list[5:10]]
        self.assertEqual(first, ['', 'baseline', 'baseline', 'candidate', 'candidate'])
        self.assertEqual(second, ['', 'candidate', 'candidate', 'baseline', 'baseline'])
        exit_control.assert_called_once()
        routes = [c.args[2] for c in emit.call_args_list if c.args[1].startswith('transfer_cloudflare')]
        self.assertIn('xhttp', routes)

    @patch('probe.xhttp_exit_control', return_value=False)
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.emit')
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_invalid_exit_skips_candidate_but_baseline_continues(self, request, emit, wait, exit_control):
        self.assertFalse(probe.transfer_round('test', 'baseline', xhttp_proxy='candidate'))
        self.assertEqual(request.call_count, 18)
        self.assertFalse(any(c.args[1] == 'candidate' for c in request.call_args_list))
        skipped = [c for c in emit.call_args_list if c.args[1] == 'transfer_skipped']
        self.assertEqual(len(skipped), 6)

    @patch('probe.emit')
    def test_both_client_processes_are_monitored(self, emit):
        baseline, candidate = Mock(), Mock()
        baseline.poll.return_value = None
        candidate.poll.return_value = 1
        with self.assertRaisesRegex(RuntimeError, 'client_exited'):
            probe.check_experiment_client((baseline, candidate), 'test', 'round')
        self.assertEqual(emit.call_args.args[3]['client_index'], 1)
        self.assertTrue(emit.call_args.args[3]['cycle_invalid'])

    def test_xhttp_metrics_use_fixed_route_and_do_not_export_ids(self):
        metrics = ProbeMetrics()
        metrics.record('test', 'transfer_cloudflare_65536', 'xhttp',
                       {'ok': True, 'experiment_id': 'private-round'}, now=1)
        self.assertIn('route="xhttp"', metrics.render())
        self.assertNotIn('private-round', metrics.render())

    @patch('probe.signal.signal')
    @patch('probe.stop_client')
    @patch('probe.start_client')
    @patch('probe.experiment_loop', side_effect=RuntimeError('client_exited'))
    def test_both_clients_are_stopped_on_experiment_failure(self, loop, start, stop, signal):
        baseline, candidate = Mock(), Mock()
        start.side_effect = [baseline, candidate]
        env = {
            'PROFILE_NAME': 'test',
            'PROFILE_LINK': 'vless://{XRAY_USER_UUID:5}@senaev.com:443?type=tcp&security=reality&flow=xtls-rprx-vision&fp=chrome&sni=senaev.com&pbk={XRAY_REALITY_PUBLIC_KEY}&sid=',
            'XRAY_USER_UUID': 'base', 'XRAY_REALITY_PUBLIC_KEY': 'unused',
            'EXPECTED_EXITS': '{"5":"senaev.com"}',
            'CONTROLLED_EXPERIMENT': 'true', 'XHTTP_PROFILE_LINK': LINK}
        with patch.dict(os.environ, env):
            with self.assertRaisesRegex(RuntimeError, 'client_exited'):
                probe.run(Mock(once=False, invalid=False))
        self.assertEqual([c.args[0] for c in stop.call_args_list], [candidate, baseline])
        self.assertEqual(loop.call_args.kwargs['child'], (baseline, candidate))

    @patch('probe.request')
    def test_cancelled_exit_control_sends_no_request(self, request):
        stop = Mock()
        stop.is_set.return_value = True
        with patch('probe.STOP', stop):
            self.assertFalse(probe.xhttp_exit_control('test', 'proxy', 'round'))
        request.assert_not_called()
