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
