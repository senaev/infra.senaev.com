import os
import unittest
from unittest.mock import Mock, patch

import probe


class SourceControlTests(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_one_round_has_same_small_target_and_bounded_quiet_intervals(self, request, fresh, wait, emit):
        self.assertEqual(probe.xhttp_source_control('hetzner', once=True), 0)
        request.assert_called_once_with('https://www.cloudflare.com/cdn-cgi/trace', '', 4096)
        fresh.assert_called_once()
        self.assertEqual(fresh.call_args.args[:2], ('hetzner', None))
        self.assertEqual(fresh.call_args.args[2], emit.call_args.args[3]['experiment_id'])
        self.assertTrue(300 <= wait.call_args_list[0].args[0] <= 360)
        self.assertTrue(60 <= wait.call_args_list[1].args[0] <= 90)
        self.assertEqual(wait.call_count, 2)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', return_value=False)
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_failed_candidate_does_not_report_round_success(self, request, fresh, wait, emit):
        self.assertEqual(probe.xhttp_source_control('hetzner', once=True), 1)

    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.fresh_xhttp_exit_control', return_value=True)
    @patch('probe.request', return_value=({'ok': False}, ''))
    def test_failed_direct_control_keeps_comparison_inconclusive(self, request, fresh, wait, emit):
        self.assertEqual(probe.xhttp_source_control('hetzner', once=True), 1)
        fresh.assert_called_once()

    @patch('probe.emit')
    @patch('probe.experiment_wait', side_effect=[False, True])
    @patch('probe.fresh_xhttp_exit_control')
    @patch('probe.request', return_value=({'ok': True}, ''))
    def test_shutdown_before_candidate_starts_no_client(self, request, fresh, wait, emit):
        self.assertEqual(probe.xhttp_source_control('hetzner', once=True), 1)
        fresh.assert_not_called()

    @patch('probe.signal.signal')
    @patch('probe.start_client')
    @patch('probe.xhttp_source_control', return_value=0)
    def test_source_mode_needs_no_baseline_profile_or_exit_map(self, control, start, signal):
        with patch.dict(os.environ, {'PROFILE_NAME': 'hetzner', 'XHTTP_SOURCE_CONTROL': 'true'}, clear=True):
            self.assertEqual(probe.run(Mock(once=True, invalid=False)), 0)
        control.assert_called_once_with('hetzner', once=True)
        start.assert_not_called()
