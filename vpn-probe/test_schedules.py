import unittest
from unittest.mock import patch
import probe


class ScheduleTests(unittest.TestCase):
    @patch('probe.time.monotonic', side_effect=[100, 120])
    @patch('probe.random.uniform', side_effect=[10, 330])
    @patch('probe.https_bulk_controls')
    @patch('probe.STOP')
    def test_bulk_uses_start_cadence_not_completion_delay(self, stop, bulk, jitter, clock):
        stop.wait.side_effect = [False, True]
        stop.is_set.return_value = False
        probe.https_control_loop('home')
        bulk.assert_called_once_with('home', quiet=False)
        self.assertEqual([c.args[0] for c in stop.wait.call_args_list], [10, 310])

    @patch('probe.time.monotonic', side_effect=[100, 500])
    @patch('probe.random.uniform', side_effect=[0, 300])
    @patch('probe.https_bulk_controls')
    @patch('probe.STOP')
    def test_slow_bulk_does_not_accumulate_runs(self, stop, bulk, jitter, clock):
        stop.wait.side_effect = [False, True]
        stop.is_set.return_value = False
        probe.https_control_loop('home')
        self.assertEqual(bulk.call_count, 1)
        self.assertEqual(stop.wait.call_args.args, (0,))

    @patch('probe.emit')
    @patch('probe.request', return_value=({'ok': True}, ''))
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.xhttp_transport_controls')
    def test_independent_matrix_does_not_dial_shared_fresh_port(self, fresh, wait, request, emit):
        probe.xhttp_response_diagnostics('home', 'proxy', None, 'round', independent=True)
        fresh.assert_not_called()
        self.assertEqual(request.call_count, 2)

    @patch('probe.https_bulk_controls')
    @patch('probe.transfer_round', return_value=False)
    @patch('probe.experiment_wait', return_value=False)
    def test_failed_matrix_does_not_run_independent_bulk_inline(self, wait, matrix, bulk):
        self.assertEqual(probe.experiment_loop('home', 'proxy', once=True,
                         diagnostics=True, independent=True), 1)
        bulk.assert_not_called()
