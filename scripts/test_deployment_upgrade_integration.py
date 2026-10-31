"""Run the real upgrade shell/JQ logic with a fake cluster boundary."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class UpgradeImagesIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        (self.root / "control-plane").mkdir()
        (self.root / "common").mkdir()
        self.script = self.root / "control-plane/upgrade-namespace.sh"
        self.script.write_text(Path("provisioning/control-plane/upgrade-namespace.sh").read_text())
        (self.root / "common/.env").write_text(f"K3S_CLUSTER_PATH={self.root}\n")
        helm = self.bin / "helm"
        helm.write_text("""#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
if sys.argv[1] == 'list':
    print('[{}]' if os.environ.get('EXISTING') else '[]')
elif sys.argv[1] == 'get':
    if os.environ.get('FAIL_GET'):
        sys.exit(7)
    print(json.dumps({'serviceImages': json.loads(os.environ.get('OLD_IMAGES', '{}')), 'staleDefault': True}))
elif sys.argv[1] == 'upgrade':
    Path(os.environ['CAPTURE']).write_text(json.dumps(sys.argv[1:]))
    sys.exit(int(os.environ.get('FAIL_UPGRADE', '0')))
else:
    sys.exit(9)
""")
        helm.chmod(0o755)
        kubectl = self.bin / "kubectl"
        kubectl.write_text("#!/bin/sh\nexit 0\n")
        kubectl.chmod(0o755)
        self.env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"], "CAPTURE": str(self.root / "args.json")}

    def upgrade(self, old=None, updates=None, **env):
        if old is not None:
            self.env.update(EXISTING="1", OLD_IMAGES=json.dumps(old))
        if updates is not None:
            p = self.root / "updates.json"
            p.write_text(json.dumps(updates))
            self.env['SERVICE_IMAGES_FILE'] = str(p)
        self.env.update(env)
        return subprocess.run(['bash', str(self.script), 'senaev-com', 'senaev-com', '--wait'], env=self.env, capture_output=True, text=True)

    def images(self):
        args = json.loads((self.root / 'args.json').read_text())
        self.assertEqual(args[:2], ['upgrade', '--install'])
        self.assertIn('--wait', args)
        return json.loads(args[args.index('--set-json') + 1].split('=', 1)[1])

    def test_new_release_installs_with_new_image(self):
        self.assertEqual(self.upgrade(updates={'worker': 'new-digest'}).returncode, 0)
        self.assertEqual(self.images(), {'worker': 'new-digest'})

    def test_existing_release_merges_pins_without_reusing_old_defaults(self):
        self.assertEqual(self.upgrade(old={'worker': 'old', 'other': 'keep'}, updates={'worker': 'new'}).returncode, 0)
        self.assertEqual(self.images(), {'worker': 'new', 'other': 'keep'})

    def test_chart_only_update_preserves_deployed_image(self):
        self.assertEqual(self.upgrade(old={'worker': 'pinned'}, updates={}).returncode, 0)
        self.assertEqual(self.images(), {'worker': 'pinned'})

    def test_cluster_errors_are_not_silenced(self):
        self.assertEqual(self.upgrade(old={}, FAIL_GET='1').returncode, 7)
        self.assertFalse((self.root / 'args.json').exists())

    def test_upgrade_failure_propagates(self):
        self.assertEqual(self.upgrade(updates={}, FAIL_UPGRADE='3').returncode, 3)


if __name__ == '__main__':
    unittest.main()
