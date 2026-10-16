# Cloud Server Architecture

## Server Overview

This environment is for working with git repositories and source code. OpenCode, Code Tools and the Telegram bot share the same git project storage. Other application data is managed by its own service and is not mounted here.

---

## Main Folder Structure

### `/projects` - Root Projects Folder

Git working copies are stored under `/projects/git`. This is also the default OpenCode working directory and the Telegram file browser root. Choose a repository subfolder before making changes.

#### 1. **`/projects/git`** (ProjectsGit)

- **Purpose:** Working with git repositories
- **Description:** Directory for cloning and working with external git repositories. All git projects cloned from GitHub, GitLab, or other git hosting services are stored here.
- **Usage:**
  ```bash
  cd /projects/git
  git clone <repository-url>
  ```


---

## Voice Input and Speech Recognition

User messages may originate from voice recordings transcribed via speech-to-text (Whisper). This introduces transcription errors where similarly-sounded words or phrases are confused.

**Guidelines when input looks strange or ambiguous:**

- Assume the most plausible interpretation given the context rather than treating it as-is.
- If a term, file name, command, or phrase seems garbled or out of place, infer the most likely intended meaning.
- Always inform the user of any assumption made, using this format:
  > I think you meant **X** instead of **Y** — proceeding with that interpretation.
- If the intent is genuinely unclear and the wrong interpretation could cause harm or irreversible changes, ask for clarification before acting.

---

## Additional Information

### Git Repositories
Every project is a folder in `/projects/git` that holds one git repository. Clone a new
repository there (`git clone <url> /projects/git/<name>`), never inside another project.
Do not clone a repository again if it is already there. GitHub works over SSH
(`git@github.com:owner/repo.git`) and HTTPS; `gh` is logged in.

Workflow for a task:

1. Read the project's `AGENTS.md` (or `README.md`).
2. `git fetch`, then create a new branch from the up-to-date default branch.
3. Make the changes and run the project's checks.
4. Commit, push the branch and open a pull request with `gh pr create`.

Within the user's requested scope, you may create and switch branches, commit, push the
working branch and open a pull request without asking again. Get explicit user consent
before you commit to the default branch (for example `main`), push to it, or merge a pull
request into it. Permission to work on a branch or open a pull request is not permission
to merge. Ask the user before a command that deletes: `rm -r`, `git reset --hard`,
`git branch -D`.

## Server Directory Reference

| Directory | Type | Purpose |
|-----------|------|---------|
| `/projects/git` | Working directory | Git repositories and source code |
