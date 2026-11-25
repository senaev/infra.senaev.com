# VPN repair playbook

How the agent and the user work on this project. The agent reads this file at the start of every
round and follows it.

**Goal:** the VPN works from home. The probes on the `senaev-media` node stand in for the user's
devices; a test on the phone only confirms. Through the VPN, traffic behaves like
direct traffic: the same public targets and sizes succeed as often, at a similar speed.

## The user's "OK"

When the user answers "OK" (or any clear agreement) to a round's pull request, it means:

- they approve all the changes in that pull request, as it is;
- the agent starts the next round right away.

An "OK" applies only to the pull request it answers. It does not approve later changes or other
pull requests. If the user asks a question or requests a change instead, answer or change it, and
wait for a new "OK".

## A round

1. **Merge.** Squash-merge the approved pull request into `main`.
2. **Deploy.** Follow the Deploy workflow run until it finishes. Check that the VPN pods are
   running and their logs look healthy.
3. **Wait for statistics.** Choose a reasonable wait for the question this round asks: from about
   5 minutes to 1 day. Schedule a wake-up (`send_later`) instead of polling.
4. **Analyze.** After waking up, read the probe metrics (VictoriaMetrics/Grafana), Datadog logs and
   pod logs. Compare them with earlier rounds and with the prediction the round made. Decide what
   the result means.
5. **Hypothesis.** From these statistics and everything learned so far (README, worklog), choose
   the strongest hypothesis: the next step that brings us closest to a working VPN from home.
6. **Implement.** Make the change that tests the hypothesis, in a new worktree off the latest
   `origin/main`. Update the README "Current status" and the worklog (newest record first).
7. **Pull request.** Open the pull request (not a draft) and let the automatic checks run.
8. **Code review loop.**
   - Request a Codex review (`@codex review`) and wait for it and for the CodeRabbit review.
   - Wait up to 10 minutes for each review. No answer in 10 minutes, or an answer that the
     quota is used up, means that review is skipped this time: continue without it.
   - Fix every comment that is valid, push, and request the reviews again. When a comment is
     wrong, answer it on the pull request with the reason, and mention it in the hand-over.
   - Repeat until the reviews have nothing left to change and the checks pass.
9. **Hand over.** Send the user the link `https://github.com/senaev/infra.senaev.com/pull/<n>/changes`
   with a short summary: what the last round showed, the hypothesis, and what this round changes.
   Steps that only the user can do (for example, importing a profile on the phone) go into this
   summary.    Then stop and wait for the user's answer.

## Scope of changes

A round's pull request changes only the VPN: the `vpn` namespace and VPN services (Xray servers,
the subscription service, the VPN probes), the VPN documents (`AGENTS.VPN.md`, this project) and
the telemetry needed for this problem (VPN and iperf3 dashboards, iperf3 pairs, probe metrics). It
must not affect any other service in the cluster.

## When the agent contacts the user

Only in two cases:

1. **A problem that needs the user.** Stop and ask what to do. Examples: a deploy breaks something,
   a step needs access or an action only the user has (a phone, the home router, a console), or
   the next step goes beyond the scope above.
2. **A round is ready.** The pull request passed the code reviews and is ready for the user's
   review (step 9).

Otherwise work silently: no progress messages between these two points.

## Other rules

- Never revert automatically. If a round makes things worse, explain it to the user; a revert
  can be the next round's hypothesis.
- If several rounds in a row bring no new information, tell the user.
- Several changes in one round are allowed when each one helps test the hypothesis.
