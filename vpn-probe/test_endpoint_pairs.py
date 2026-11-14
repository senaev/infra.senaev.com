import unittest
from unittest.mock import patch
import probe
from metrics import ProbeMetrics


class EndpointPairs(unittest.TestCase):
    @patch('probe.emit')
    @patch('probe.experiment_wait', return_value=False)
    @patch('probe.request')
    def test_identical_h1_target_and_failed_direct_marks_inconclusive(self, request, wait, emit):
        request.side_effect = [({'ok': False}, ''), ({'ok': True}, '')]
        self.assertFalse(probe.h1_transfer_controls('home', 'proxy', None, 'pair',
                         immediate_size=65536, endpoint=True))
        self.assertEqual([c.args for c in request.call_args_list], [
            ('https://senaev.com/api/vpn-test?bytes=65536', '', 65536),
            ('https://senaev.com/api/vpn-test?bytes=65536', 'proxy', 65536)])
        self.assertTrue(all(c.kwargs == {'expected_bytes': 65536, 'http1': True}
                            for c in request.call_args_list))
        result = emit.call_args.args[3]
        self.assertTrue(result['comparison_inconclusive'])
        self.assertFalse(result['direct_control_ok'])
        metrics = ProbeMetrics()
        metrics.record('home', 'transfer_h1_fresh_endpoint_65536', 'xhttp', result)
        self.assertEqual(len(metrics.results), 1)

    def test_endpoint_sizes_are_bounded(self):
        with self.assertRaises(ValueError):
            probe.h1_transfer_controls('home', '', None, 'pair', immediate_size=524288, endpoint=True)
