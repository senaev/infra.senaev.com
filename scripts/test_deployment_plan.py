import json
import tempfile
import unittest
from pathlib import Path

from deployment_plan import plan


class DeploymentPlanTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.write(".github/deploy-config.json", json.dumps({
            "namespaces": {"vm-stack": "telemetry"},
            "services": {"omp-web": {"repository": "ghcr.io/senaev/opencode-serve"}},
        }))
        for chart in ["senaev-com", "vm-stack"]:
            self.write(f"provisioning/helm/{chart}/Chart.yaml", "")
        for service in ["worker", "omp-web"]:
            self.write(f"{service}/Dockerfile", "FROM scratch")
        self.write("worker/package.json", '{"dependencies":{"senaev-utils":"file:../senaev-utils"}}')

    def write(self, name, content):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def result(self, changed):
        return plan(self.root, changed, "senaev/infra.senaev.com")

    def test_first_deployment_discovers_all_images_and_namespaces(self):
        result = self.result(None)
        self.assertEqual([b["name"] for b in result["builds"]], ["omp-web", "worker"])
        self.assertEqual(result["charts"][-1], {"chart": "vm-stack", "namespace": "telemetry"})
        self.assertEqual(result["builds"][0]["repository"], "ghcr.io/senaev/opencode-serve")

    def test_service_change_builds_before_its_chart(self):
        result = self.result(["worker/src/main.ts"])
        self.assertEqual([b["name"] for b in result["builds"]], ["worker"])
        self.assertEqual(result["charts"], [{"chart": "senaev-com", "namespace": "senaev-com"}])

    def test_chart_change_does_not_rebuild_images(self):
        result = self.result(["provisioning/helm/senaev-com/values.yaml"])
        self.assertEqual(result["builds"], [])
        self.assertEqual(len(result["charts"]), 1)

    def test_common_values_and_upgrade_script_select_all_charts(self):
        for path in ["provisioning/helm/common-values.yaml", "provisioning/control-plane/upgrade-namespace.sh"]:
            result = self.result([path])
            self.assertEqual(result["builds"], [])
            self.assertEqual(len(result["charts"]), 2)

    def test_shared_library_only_rebuilds_linked_consumers(self):
        self.assertEqual([b["name"] for b in self.result(["senaev-utils/src/a.ts"])["builds"]], ["worker"])

    def test_new_service_and_chart_need_no_workflow_entry(self):
        self.write("new-service/Dockerfile", "FROM scratch")
        self.write("provisioning/helm/new-chart/Chart.yaml", "")
        result = self.result(["new-service/Dockerfile", "provisioning/helm/new-chart/Chart.yaml"])
        self.assertEqual(result["builds"][0]["name"], "new-service")
        self.assertIn({"chart": "new-chart", "namespace": "new-chart"}, result["charts"])

    def test_unrelated_changes_are_noop(self):
        self.assertEqual(self.result(["README.md"]), {"builds": [], "charts": []})

    def test_pipeline_change_rebuilds_all_for_safe_migration(self):
        self.assertEqual(self.result([".github/workflows/deploy.yml"]), self.result(None))

    def test_combined_changes_include_every_service_since_baseline(self):
        result = self.result(["worker/src/a.ts", "omp-web/start.sh"])
        self.assertEqual(len(result["builds"]), 2)
        self.assertEqual(len(result["charts"]), 1)

    def test_invalid_remote_identifiers_fail(self):
        self.write("provisioning/helm/bad;command/Chart.yaml", "")
        with self.assertRaises(ValueError):
            self.result(None)


if __name__ == "__main__":
    unittest.main()
