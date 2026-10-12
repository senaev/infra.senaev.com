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
All cloned repositories should be placed in `/projects/git` for convenient organization and management.

## Server Directory Reference

| Directory | Type | Purpose |
|-----------|------|---------|
| `/projects/git` | Working directory | Git repositories and source code |
