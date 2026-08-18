import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; version: string; body?: string }
  | { status: "up-to-date" }
  | { status: "downloading"; progress: number }
  | { status: "ready" }
  | { status: "error"; message: string };

export async function checkForAppUpdates(
  onStateChange: (state: UpdateState) => void
) {
  try {
    onStateChange({ status: "checking" });
    const update = await check();
    if (!update) {
      onStateChange({ status: "up-to-date" });
      return;
    }
    if (update.available) {
      onStateChange({
        status: "available",
        version: update.version,
        body: update.body || undefined,
      });
    } else {
      onStateChange({ status: "up-to-date" });
    }
  } catch (err) {
    onStateChange({ status: "error", message: String(err) });
  }
}

export async function installUpdate(
  onStateChange: (state: UpdateState) => void
) {
  try {
    onStateChange({ status: "checking" });
    const update = await check();
    if (update?.available) {
      let downloaded = 0;
      let contentLength = 0;

      onStateChange({ status: "downloading", progress: 0 });
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const progress = contentLength ? Math.round((downloaded / contentLength) * 100) : 50;
          onStateChange({ status: "downloading", progress });
        } else if (event.event === "Finished") {
          onStateChange({ status: "ready" });
        }
      });
      await relaunch();
    }
  } catch (err) {
    onStateChange({ status: "error", message: String(err) });
  }
}
