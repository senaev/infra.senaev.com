"""Manual routing safety test: XRAY_BINARY=/path/to/xray python3 vpn-probe/routing.integration.py.

Renders the real chart. Replaces Reality/Vision with loopback plain VLESS and fake
credentials; preserves user routing/outbounds. No cluster access or host changes.
"""
import copy
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def main():
    rendered = subprocess.check_output(['helm', 'template', 'vpn', 'provisioning/helm/vpn',
        '-f', 'provisioning/helm/common-values.yaml', '-f', 'provisioning/helm/vpn/values.yaml'], text=True)
    document = next(d for d in rendered.split('---') if 'name: xray-vpn-firstvds-config-template\n' in d)
    config = json.JSONDecoder().raw_decode(document.split('full-config.json: |', 1)[1].lstrip())[0]
    assert all(o['protocol'] == 'socks' for o in config['outbounds']), 'Entry has a non-proxy outbound'
    assert len(config['inbounds']) == 1 and config['inbounds'][0]['protocol'] == 'vless'
    selected = config['routing']['rules'][0]['outboundTag']
    assert selected == 'outbound-hetzner'
    hits, children = [], []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'origin-ok')

        def log_message(self, *_):
            pass

    origin = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=origin.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix='vpn-routing-') as folder:
        def start(name, value, listen):
            path = Path(folder) / (name + '.json')
            path.write_text(json.dumps(value))
            child = subprocess.Popen([os.environ['XRAY_BINARY'], 'run', '-config', str(path)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            children.append(child)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and child.poll() is None:
                try:
                    with socket.create_connection(('127.0.0.1', listen), timeout=.1):
                        return child
                except OSError:
                    time.sleep(.02)
            raise RuntimeError(name + ' did not start')

        try:
            entry_port, client_port = port(), port()
            for outbound in config['outbounds']:
                outbound['settings']['servers'] = [{'address': '127.0.0.1', 'port': port()}]
            exit_port = next(o for o in config['outbounds'] if o['tag'] == selected)['settings']['servers'][0]['port']
            inbound = config['inbounds'][0]
            inbound.update(listen='127.0.0.1', port=entry_port, streamSettings={'network': 'tcp', 'security': 'none'})
            assert len(inbound['settings']['clients']) == 1
            for client in inbound['settings']['clients']:
                client.update(id='11111111-1111-1111-1111-111111111111', flow='')
            exit_config = {'inbounds': [{'listen': '127.0.0.1', 'port': exit_port, 'protocol': 'socks', 'settings': {'auth': 'noauth'}}],
                           'outbounds': [{'protocol': 'freedom', 'settings': {'finalRules': [
                               {'action': 'allow', 'ip': ['127.0.0.1/32'], 'port': origin.server_port}]}}]}
            client_config = {'inbounds': [{'listen': '127.0.0.1', 'port': client_port, 'protocol': 'socks'}],
                             'outbounds': [{'protocol': 'vless', 'settings': {'vnext': [{'address': '127.0.0.1',
                                 'port': entry_port, 'users': [{'id': inbound['settings']['clients'][0]['id'], 'encryption': 'none'}]}]}}]}
            for outbound in config['outbounds']:
                other_port = outbound['settings']['servers'][0]['port']
                if outbound['tag'] != selected:
                    alternate = copy.deepcopy(exit_config)
                    alternate['inbounds'][0]['port'] = other_port
                    start(outbound['tag'], alternate, other_port)
            exit_process = start('exit', exit_config, exit_port)
            start('entry', copy.deepcopy(config), entry_port)
            start('client', client_config, client_port)
            def request():
                return subprocess.run(['curl', '--disable', '--silent', '--max-time', '2', '--noproxy', '',
                    '--proxy', f'socks5h://127.0.0.1:{client_port}', f'http://127.0.0.1:{origin.server_port}/'],
                    capture_output=True, timeout=4)
            assert request().stdout == b'origin-ok' and len(hits) == 1
            exit_process.terminate()
            exit_process.wait(timeout=3)
            assert request().returncode != 0 and len(hits) == 1, 'Exit failure leaked to origin'
            start('recovered-exit', exit_config, exit_port)
            assert request().stdout == b'origin-ok' and len(hits) == 2
            print('PASS: rendered FirstVDS routing: healthy exit -> failed exit blocks origin -> recovery')
        finally:
            for child in children:
                if child.poll() is None:
                    child.terminate()
                try:
                    child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=3)
            origin.shutdown()
            origin.server_close()


if __name__ == '__main__':
    main()
