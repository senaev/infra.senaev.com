import unittest
from unittest.mock import patch
import socket_stats


class SocketStatsTests(unittest.TestCase):
    def test_filters_pid_and_ignores_addresses_and_other_processes(self):
        output = ('ESTAB 0 0 1.2.3.4:123 5.6.7.8:443 users:(("xray",pid=42,fd=3))\n'
                  '   mss:988 pmtu:1500 retrans:0/7 bytes_received:123\n'
                  'ESTAB 0 0 other:123 peer:443 users:(("xray",pid=420,fd=3))\n'
                  '   mss:1448 bytes_received:999\n')
        self.assertEqual(socket_stats.parse_stats(output, 42),
                         [{"mss": 988, "pmtu": 1500, "retrans": 0,
                           "total_retrans": 7, "bytes_received": 123}])

    @patch('socket_stats.subprocess.run', side_effect=FileNotFoundError)
    def test_unavailable_is_explicit_and_does_not_raise(self, run):
        observer = socket_stats.SocketStats(42)
        observer.collect()
        self.assertEqual(observer.unavailable, 'ss_unavailable')
