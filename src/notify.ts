import execa from 'execa';

let enabled = true;

export function setNotificationsEnabled(value: boolean): void {
  enabled = value;
}

export async function notify(title: string, message: string): Promise<void> {
  if (!enabled) return;

  process.stdout.write('\x07');

  try {
    await execa('osascript', [
      '-e',
      `display notification "${message}" with title "${title}" sound name "Glass"`,
    ]);
  } catch {
    // Not macOS or osascript unavailable — bell already sent above
  }
}
