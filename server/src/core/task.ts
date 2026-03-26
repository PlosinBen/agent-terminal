export type TaskStatus = 'running' | 'stalled' | 'completed' | 'stopped' | 'error';

export interface TaskInfo {
  id: string;
  description: string;
  status: TaskStatus;
  startedAt: number;
  lastProgressAt: number;
}

const STALL_THRESHOLD_MS = 60_000;
const CHECK_INTERVAL_MS = 45_000;

export class TaskTracker {
  private tasks = new Map<string, TaskInfo>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private onChange?: (tasks: TaskInfo[]) => void;

  constructor(onChange?: (tasks: TaskInfo[]) => void) {
    this.onChange = onChange;
  }

  start(): void {
    this.checkInterval = setInterval(() => this.checkStalled(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  register(id: string, description: string): void {
    const now = Date.now();
    this.tasks.set(id, {
      id,
      description,
      status: 'running',
      startedAt: now,
      lastProgressAt: now,
    });
    this.notify();
  }

  progress(id: string): void {
    const task = this.tasks.get(id);
    if (task && task.status === 'running') {
      task.lastProgressAt = Date.now();
      if (task.status === 'running') this.notify();
    }
  }

  complete(id: string, status: 'completed' | 'stopped' | 'error' = 'completed'): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      this.notify();
    }
  }

  stopTask(id: string): void {
    this.complete(id, 'stopped');
  }

  getActiveTasks(): TaskInfo[] {
    return Array.from(this.tasks.values()).filter(t =>
      t.status === 'running' || t.status === 'stalled'
    );
  }

  getAllTasks(): TaskInfo[] {
    return Array.from(this.tasks.values());
  }

  private checkStalled(): void {
    const now = Date.now();
    let changed = false;
    for (const task of this.tasks.values()) {
      if (task.status === 'running' && now - task.lastProgressAt > STALL_THRESHOLD_MS) {
        task.status = 'stalled';
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  private notify(): void {
    this.onChange?.(this.getActiveTasks());
  }
}
