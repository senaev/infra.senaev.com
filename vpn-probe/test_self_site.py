import unittest
from xhttp_server import server_config


class SelfSiteRoute(unittest.TestCase):
    def test_only_exact_tls_destination_uses_internal_ingress(self):
        config = server_config('base', '/test/')
        self.assertEqual(config['routing']['rules'], [{
            'type': 'field', 'domain': ['full:senaev.com'], 'port': '443',
            'network': 'tcp', 'outboundTag': 'self-site'}])
        self.assertEqual(config['outbounds'][0]['tag'], 'internet')
        self.assertNotIn('redirect', config['outbounds'][0].get('settings', {}))
        self.assertEqual(config['outbounds'][1], {
            'tag': 'self-site', 'protocol': 'freedom',
            'settings': {'redirect': 'traefik-hetzner.traefik.svc.cluster.local:443'}})
