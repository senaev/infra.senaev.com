import { spawn } from "node:child_process";
import { logger } from "../logger";

/**
 * Runs the `ob` CLI once and resolves when it exits successfully.
 *
 * stdio is inherited so the CLI's own progress output lands in the pod logs, and
 * the environment is passed through untouched because `ob login` reads
 * OBSIDIAN_AUTH_TOKEN from it directly.
 */
export function runObsidianCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        logger.info({ args }, "▶️ Running ob");

        const child = spawn("ob", args, { stdio: "inherit" });

        child.on("error", reject);

        child.on("exit", (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`ob ${args.join(" ")} exited with code=${code} signal=${signal}`));
        });
    });
}
