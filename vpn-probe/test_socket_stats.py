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

    def test_socket_ids_follow_inode_without_exposing_it(self):
        ids = {}
        first = ('ESTAB 0 0 local:1 remote:443 users:(("xray",pid=42,fd=3)) ino:12345\n'
                 '   mss:988 bytes_received:10\n')
        row = socket_stats.parse_stats(first, 42, ids)[0]
        self.assertEqual(row["socket_id"], 1)
        self.assertEqual(row["state"], "ESTAB")
        self.assertNotIn("12345", str(row))
        again = socket_stats.parse_stats(first.replace("bytes_received:10", "bytes_received:20"), 42, ids)[0]
        self.assertEqual(again["socket_id"], 1)
        other = socket_stats.parse_stats(first.replace("ino:12345", "ino:67890"), 42, ids)[0]
        self.assertEqual(other["socket_id"], 2)

    def test_queues_and_retransmitted_bytes_are_numeric_and_socket_scoped(self):
        text = ('ESTAB 321 456 local:1 peer:443 users:(("xray",pid=42,fd=3)) ino:55\n'
                '   mss:988 bytes_sent:1000 bytes_retrans:20 notsent:30 snd_wnd:4096\n'
                'ESTAB 999 999 other:1 peer:443 users:(("xray",pid=99,fd=3)) ino:66\n'
                '   mss:1248 bytes_sent:5000\n')
        rows = socket_stats.parse_stats(text, 42, {})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["recv_q"], 321)
        self.assertEqual(rows[0]["send_q"], 456)
        self.assertEqual(rows[0]["bytes_retrans"], 20)
        self.assertEqual(rows[0]["notsent"], 30)
        self.assertNotIn("local", str(rows))

    def test_malformed_queue_is_absent_not_zero(self):
        text = ('ESTAB unknown unknown local peer users:(("xray",pid=42,fd=3)) ino:55\n'
                '   mss:988\n')
        self.assertNotIn("recv_q", socket_stats.parse_stats(text, 42, {})[0])
