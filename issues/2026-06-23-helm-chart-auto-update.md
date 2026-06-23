# Automate Helm Chart Updates on Main Branch Commits

## Plan

1.  **Analyze Existing Workflows:** Examine current GitHub Actions workflows in `.github/workflows` to understand the existing automation, particularly how Telegram notifications are handled.
2.  **Examine the `Makefile`:** Review the `Makefile` to understand the commands and dependencies for updating services.
3.  **Identify Helm Charts:** Identify all Helm charts in the `provisioning/helm` directory.
4.  **Propose a New Workflow:** Design a new GitHub Actions workflow file that will:
    *   Trigger on every push to the `main` branch.
    *   Use a matrix to handle each Helm chart individually.
    *   Check for changes in each chart's directory.
    *   If changes are found, use the commands from the `Makefile` to update the chart.
    *   Integrate existing Telegram notification logic to alert on updates.
5.  **Review and Confirm:** Present the detailed plan and proposed workflow for review and approval before implementation.

## Implementation Details

This section will be updated with the implementation details as we proceed.

Created a new GitHub Actions workflow file in `.github/workflows/update-helm-charts.yml` to automatically update Helm charts when changes are pushed to the `main` branch.

The workflow does the following:

- Triggers on pushes to the `main` branch.
- Uses a matrix strategy to iterate over each Helm chart.
- For each chart, it checks for changes in the chart's directory.
- If changes are detected, it runs the `upgrade-namespace.sh` script to update the chart.
- It sends a Telegram notification with the status of the job.
