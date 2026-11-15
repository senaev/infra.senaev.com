import unittest
from unittest.mock import patch
import probe


class FastPairTests(unittest.TestCase):
    @patch('probe.time.monotonic', side_effect=[100, 125])
    @patch('probe.random.uniform', side_effect=[12, 330])
    @patch('probe.fresh_xhttp_exit_control', return_value=False)
    @patch('probe.STOP')
    def test_independent_pair_runs_without_older_trace_gate_and_keeps_cadence(self, stop, fresh, jitter, clock):
        stop.wait.side_effect = [False, True]
        stop.is_set.return_value = False
        probe.endpoint_pair_loop('home')
        self.assertEqual(fresh.call_count, 2)
        self.assertEqual(fresh.call_args.args[:2], ('home', None))
        self.assertEqual(fresh.call_args.kwargs, {'native_tls': True, 'http1': True,
                         'payload_size': 16384, 'endpoint': True, 'port': 1084, 'tcp_max_seg': 1000})
        self.assertEqual([c.args[0] for c in stop.wait.call_args_list], [12, 305])

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    def test_scheduled_old_group_keeps_64k_without_duplicate_16k(self, fresh, wait, emit):
        probe.xhttp_transport_controls('home', None, 'round', independent=True)
        endpoints = [c.kwargs['payload_size'] for c in fresh.call_args_list if c.kwargs.get('endpoint')]
        self.assertEqual(endpoints, [65536])
        self.assertTrue(all('port' not in c.kwargs for c in fresh.call_args_list))

    def test_new_port_is_only_allowed_for_prioritized_pair(self):
        for size, endpoint, port in [(65536, True, 1084), (16384, False, 1084), (16384, True, 1085)]:
            with self.assertRaises(ValueError):
                probe.fresh_xhttp_exit_control('home', None, 'pair', native_tls=True,
                    http1=True, payload_size=size, endpoint=endpoint, port=port)

    @patch('probe.time.monotonic', side_effect=[100, 125, 430, 455])
    @patch('probe.random.uniform', side_effect=[0, 330, 330])
    @patch('probe.fresh_xhttp_exit_control')
    @patch('probe.STOP')
    def test_mss_order_alternates_and_pairs_share_round_id(self, stop, fresh, jitter, clock):
        stop.wait.side_effect = [False, False, True]
        stop.is_set.return_value = False
        probe.endpoint_pair_loop('home')
        calls = fresh.call_args_list
        self.assertEqual([c.kwargs['tcp_max_seg'] for c in calls], [None, 1000, 1000, None])
        self.assertEqual(calls[0].args[2], calls[1].args[2])
        self.assertEqual(calls[2].args[2], calls[3].args[2])
        self.assertNotEqual(calls[0].args[2], calls[2].args[2])

    def test_mss_cannot_change_other_experiments(self):
        with self.assertRaises(ValueError):
            probe.fresh_xhttp_exit_control('home', None, 'round', native_tls=True,
                http1=True, payload_size=16384, endpoint=True, tcp_max_seg=1000)
