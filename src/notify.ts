import execa from 'execa';

export async function notify(title: string, message: string): Promise<void> {
  // Terminal bell — universal fallback
  process.stdout.write('\x07');

  // macOS native notification
  try {
    await execa('osascript', [
      '-e',
      `display notification "${message}" with title "${title}" sound name "Glass"`,
    ]);
  } catch {
    // Not macOS or osascript unavailable — bell already sent above
  }
}
