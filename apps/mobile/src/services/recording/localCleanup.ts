import * as FileSystem from "expo-file-system/legacy";

export async function deleteLocalClip(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    console.warn("[localCleanup] failed", uri, e);
  }
}
