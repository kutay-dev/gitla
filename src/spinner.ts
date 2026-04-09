import { theme } from './theme';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;

  start(message: string): void {
    this.frame = 0;
    process.stdout.write('');
    this.timer = setInterval(() => {
      process.stdout.write(
        `\r${theme.primary(FRAMES[this.frame % FRAMES.length])} ${message}`,
      );
      this.frame++;
    }, 80);
  }

  stop(message?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write(`\r${message ? message : ''}  \n`);
  }
}
