import unittest
from unittest.mock import Mock, patch

import probe


class H1SizeTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_sizes_limits_order_and_bounded_pauses(self, request, wait, emit):
        self.assertTrue(probe.h1_transfer_controls('test', 'h1', None, 'round'))
        self.assertEqual(request.call_count, 6)
        for i, size in enumerate([4096, 16384, 65536]):
            direct, vpn = request.call_args_list[i*2:i*2+2]
            self.assertEqual(direct.args, (f'https://speed.cloudflare.com/__down?bytes={size}', '', size))
            self.assertEqual(vpn.args, (direct.args[0], 'h1', size))
            self.assertEqual(vpn.kwargs, {'expected_bytes': size})
            self.assertTrue(60 <= wait.call_args_list[i*2].args[0] <= 90)
            self.assertTrue(2 <= wait.call_args_list[i*2+1].args[0] <= 7)
        self.assertEqual(wait.call_count, 6)
        self.assertEqual(sum(c.args[2] for c in request.call_args_list), 172032)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_failed_direct_control_is_inconclusive_and_does_not_skip_larger_conditions(self, request, wait, emit):
        request.side_effect = [({'ok': False}, '')] + [({'ok': True}, '')] * 5
        self.assertFalse(probe.h1_transfer_controls('test', 'h1', None, 'round'))
        self.assertTrue(emit.call_args_list[1].args[3]['comparison_inconclusive'])
        self.assertEqual(request.call_count, 6)

    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False, True])
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_cancel_between_routes_stops_vpn_requests(self, request, wait, emit):
        self.assertFalse(probe.h1_transfer_controls('test', 'h1', None, 'round'))
        request.assert_called_once()

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_dead_temporary_client_sends_no_request_and_does_not_mark_baseline_dead(self, request, wait, emit):
        fresh = Mock()
        fresh.poll.return_value = 1
        with self.assertRaisesRegex(RuntimeError, 'fresh_client_exited'):
            probe.h1_transfer_controls('test', 'h1', None, 'round', fresh=fresh)
        request.assert_not_called()
        emit.assert_not_called()

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', side_effect=[True, False])
    def test_failed_h1_trace_skips_size_ladder(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertEqual(fresh.call_count, 2)
        self.assertFalse(any(c.kwargs.get('measure_sizes') for c in fresh.call_args_list))

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_completed_direct_result_is_preserved_when_client_dies(self, request, wait, emit):
        fresh = Mock()
        fresh.poll.return_value = None
        def finish_direct(*args, **kwargs):
            fresh.poll.return_value = 1
            return {'ok': True, 'bytes': 4096}, ''
        request.side_effect = finish_direct
        with self.assertRaisesRegex(RuntimeError, 'fresh_client_exited'):
            probe.h1_transfer_controls('test', 'h1', None, 'round', fresh=fresh)
        request.assert_called_once()
        emit.assert_called_once()
        self.assertEqual(emit.call_args.args[1:3], ('transfer_h1_cloudflare_4096', 'direct'))
        self.assertEqual(emit.call_args.args[3]['bytes'], 4096)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_immediate_control_has_one_small_pair_and_only_short_jitter(self, request, wait, emit):
        self.assertTrue(probe.h1_transfer_controls('test', 'h1', None, 'round', immediate_size=4096))
        self.assertEqual(request.call_count, 2)
        self.assertEqual(request.call_args_list[0].args,
                         ('https://speed.cloudflare.com/__down?bytes=4096', '', 4096))
        self.assertEqual(request.call_args_list[1].args,
                         ('https://speed.cloudflare.com/__down?bytes=4096', 'h1', 4096))
        wait.assert_called_once()
        self.assertTrue(2 <= wait.call_args.args[0] <= 7)
        self.assertTrue(all(c.args[1] == 'transfer_h1_fresh_cloudflare_4096'
                            for c in emit.call_args_list))

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', side_effect=[False, True, False, False, False, False, True, True, True])
    def test_failed_reused_ladder_still_runs_independent_fresh_control(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertTrue(fresh.call_args_list[2].kwargs['measure_sizes'])
        self.assertEqual([c.kwargs.get('payload_size') for c in fresh.call_args_list[3:]],
                         [4096, 16384, 8192, 12288, 16384, 65536])
        self.assertTrue(60 <= wait.call_args_list[-1].args[0] <= 90)

    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False, False, False, True])
    @patch('probe.fresh_xhttp_exit_control', side_effect=[True, True, False])
    def test_cancel_before_fresh_control_starts_no_extra_process(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertEqual(fresh.call_count, 3)


    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_fresh_16k_has_exact_cap_and_no_long_post_exit_wait(self, request, wait, emit):
        self.assertTrue(probe.h1_transfer_controls('test', 'h1', None, 'round',
                                                 immediate_size=16384))
        self.assertEqual(request.call_count, 2)
        for call in request.call_args_list:
            self.assertEqual(call.args[0], 'https://speed.cloudflare.com/__down?bytes=16384')
            self.assertEqual(call.args[2], 16384)
            self.assertEqual(call.kwargs, {'expected_bytes': 16384})
        wait.assert_called_once()
        self.assertTrue(2 <= wait.call_args.args[0] <= 7)
        self.assertTrue(all(c.args[1] == 'transfer_h1_fresh_cloudflare_16384'
                            for c in emit.call_args_list))

    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False, False, False, False, True])
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    def test_cancel_before_fresh_16k_starts_no_second_size_client(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertEqual(fresh.call_count, 4)
        self.assertEqual(fresh.call_args.kwargs['payload_size'], 4096)

    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request', side_effect=[({'ok': True, 'bytes': 16384}, ''),
                                       ({'ok': False, 'bytes': 0}, '')])
    def test_actual_emit_exports_fresh_16k_control_to_metrics(self, request, wait):
        from metrics import ProbeMetrics
        metrics = ProbeMetrics()
        with patch('probe.METRICS', metrics), patch('builtins.print'):
            self.assertFalse(probe.h1_transfer_controls('test', 'h1', None, 'round',
                                                       immediate_size=16384))
        rendered = metrics.render()
        self.assertIn('check="transfer_h1_fresh_cloudflare_16384",route="direct"} 1', rendered)
        self.assertIn('check="transfer_h1_fresh_cloudflare_16384",route="xhttp"} 0', rendered)

    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_fresh_8k_pair_caps_jitter_and_exports_actual_results(self, request, wait):
        from metrics import ProbeMetrics
        request.side_effect = [({'ok': True, 'bytes': 8192}, ''),
                               ({'ok': False, 'bytes': 0}, '')]
        metrics = ProbeMetrics()
        with patch('probe.METRICS', metrics), patch('builtins.print'):
            self.assertFalse(probe.h1_transfer_controls('test', 'h1', None, 'round',
                                                       immediate_size=8192))
        self.assertEqual([c.args for c in request.call_args_list], [
            ('https://speed.cloudflare.com/__down?bytes=8192', '', 8192),
            ('https://speed.cloudflare.com/__down?bytes=8192', 'h1', 8192)])
        self.assertTrue(all(c.kwargs == {'expected_bytes': 8192} for c in request.call_args_list))
        wait.assert_called_once()
        self.assertTrue(2 <= wait.call_args.args[0] <= 7)
        rendered = metrics.render()
        self.assertIn('check="transfer_h1_fresh_cloudflare_8192",route="direct"} 1', rendered)
        self.assertIn('check="transfer_h1_fresh_cloudflare_8192",route="xhttp"} 0', rendered)

    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False] * 5 + [True])
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    def test_cancel_before_appended_8k_starts_no_extra_client(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertEqual(fresh.call_count, 5)
        self.assertEqual(fresh.call_args.kwargs['payload_size'], 16384)

    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_fresh_12k_pair_caps_jitter_and_exports_actual_results(self, request, wait):
        from metrics import ProbeMetrics
        request.side_effect = [({'ok': True, 'bytes': 12288}, ''),
                               ({'ok': False, 'bytes': 0}, '')]
        metrics = ProbeMetrics()
        with patch('probe.METRICS', metrics), patch('builtins.print'):
            self.assertFalse(probe.h1_transfer_controls('test', 'h1', None, 'round',
                                                       immediate_size=12288))
        self.assertEqual([c.args for c in request.call_args_list], [
            ('https://speed.cloudflare.com/__down?bytes=12288', '', 12288),
            ('https://speed.cloudflare.com/__down?bytes=12288', 'h1', 12288)])
        self.assertTrue(all(c.kwargs == {'expected_bytes': 12288} for c in request.call_args_list))
        wait.assert_called_once()
        self.assertTrue(2 <= wait.call_args.args[0] <= 7)
        rendered = metrics.render()
        self.assertIn('check="transfer_h1_fresh_cloudflare_12288",route="direct"} 1', rendered)
        self.assertIn('check="transfer_h1_fresh_cloudflare_12288",route="xhttp"} 0', rendered)


    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False] * 6 + [True])
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    def test_cancel_before_12k_starts_no_extra_client(self, fresh, wait, emit):
        self.assertFalse(probe.xhttp_transport_controls('test', None, 'round'))
        self.assertEqual(fresh.call_count, 6)
        self.assertEqual(fresh.call_args.kwargs['payload_size'], 8192)
