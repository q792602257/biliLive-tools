import { TaskQueue, AbstractTask } from "../../src/task/task.js";
import { appConfig } from "../../src/config.js";
import { TaskType } from "../../src/enum.js";
import { sleep } from "../../src/utils/index.js";
import { expect, describe, it, beforeEach, vi } from "vitest";

describe("TaskQueue", () => {
  class TestTask extends AbstractTask {
    type: "test";
    exec = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    kill = vi.fn();
  }

  let taskQueue: TaskQueue;

  beforeEach(() => {
    taskQueue = new TaskQueue();
  });

  it("should add a task to the queue", () => {
    const task = new TestTask();
    taskQueue.addTask(task);
    expect(taskQueue.list()).toContain(task);
  });

  it("should start a pending task", () => {
    const task = new TestTask();
    taskQueue.addTask(task, false);
    expect(task.exec).not.toHaveBeenCalled();

    taskQueue.start(task.taskId);
    expect(task.exec).toHaveBeenCalled();
  });

  it("should remove a task from the queue", () => {
    const task = new TestTask();
    taskQueue.addTask(task);
    taskQueue.remove(task.taskId);
    expect(taskQueue.list()).not.toContain(task);
  });

  it("should return a list of tasks", () => {
    const task1 = new TestTask();
    const task2 = new TestTask();
    taskQueue.addTask(task1);
    taskQueue.addTask(task2);
    const tasks = taskQueue.list();
    expect(tasks).toContain(task1);
    expect(tasks).toContain(task2);
  });

  it("should emit task events", async () => {
    // @ts-ignore
    vi.spyOn(appConfig, "getAll").mockReturnValue({
      task: { ffmpegMaxNum: -1, douyuDownloadMaxNum: 2 },
    });

    const callback = vi.fn();
    taskQueue.on("task-end", callback);

    class TestTask extends AbstractTask {
      type: string;
      exec = vi.fn().mockImplementation(() => {
        this.emitter.emit("task-end", { taskId: this.taskId });
        this.status = "completed";
      });
      pause = vi.fn();
      resume = vi.fn();
      kill = vi.fn();
    }
    const task = new TestTask();

    taskQueue.addTask(task, true);
    expect(task.exec).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ taskId: task.taskId });
    expect(task.status).toBe("completed");
  });
  describe("addTaskForLimit", () => {
    class FFmpegTask extends AbstractTask {
      type: string = TaskType.ffmpeg;
      exec = vi.fn().mockImplementation(async () => {
        this.emitter.emit("task-start", { taskId: this.taskId });
        this.status = "running";
        await sleep(200);
        this.status = "completed";
        this.emitter.emit("task-end", { taskId: this.taskId });
      });
      pause = vi.fn();
      resume = vi.fn();
      kill = vi.fn();
    }

    beforeEach(() => {
      // @ts-ignore
      vi.spyOn(appConfig, "getAll").mockReturnValue({
        task: { ffmpegMaxNum: 2, douyuDownloadMaxNum: 2 },
      });
      taskQueue = new TaskQueue();
    });
    it("should ffmpeg task add with limit", async () => {
      const task1 = new FFmpegTask();
      const task2 = new FFmpegTask();
      const task3 = new FFmpegTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).not.toHaveBeenCalled();
    });
    it("should douyuTask task add with limit", async () => {
      class DouyuDownloadTask extends AbstractTask {
        type: string = TaskType.douyuDownload;
        exec = vi.fn().mockImplementation(async () => {
          this.emitter.emit("task-start", { taskId: this.taskId });
          this.status = "running";
          await sleep(200);
          this.status = "completed";
          this.emitter.emit("task-end", { taskId: this.taskId });
        });
        pause = vi.fn();
        resume = vi.fn();
        kill = vi.fn();
      }
      const task1 = new DouyuDownloadTask();
      const task2 = new DouyuDownloadTask();
      const task3 = new DouyuDownloadTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).not.toHaveBeenCalled();
    });
    it("should ffmpeg task add with no limit", async () => {
      // @ts-ignore
      vi.spyOn(appConfig, "getAll").mockReturnValue({
        task: { ffmpegMaxNum: -1, douyuDownloadMaxNum: -1 },
      });

      const task1 = new FFmpegTask();
      const task2 = new FFmpegTask();
      const task3 = new FFmpegTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).toHaveBeenCalled();
    });
    it("should douyuTask task add with no limit", async () => {
      class DouyuDownloadTask extends AbstractTask {
        type: string = TaskType.douyuDownload;
        exec = vi.fn().mockImplementation(async () => {
          this.emitter.emit("task-start", { taskId: this.taskId });
          this.status = "running";
          await sleep(200);
          this.status = "completed";
          this.emitter.emit("task-end", { taskId: this.taskId });
        });
        pause = vi.fn();
        resume = vi.fn();
        kill = vi.fn();
      }

      // @ts-ignore
      vi.spyOn(appConfig, "getAll").mockReturnValue({
        task: { ffmpegMaxNum: -1, douyuDownloadMaxNum: -1 },
      });

      const task1 = new DouyuDownloadTask();
      const task2 = new DouyuDownloadTask();
      const task3 = new DouyuDownloadTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).toHaveBeenCalled();
    });
    it("should auto start after task-end event", async () => {
      const task1 = new FFmpegTask();
      const task2 = new FFmpegTask();
      const task3 = new FFmpegTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      await sleep(10);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).not.toHaveBeenCalled();
      await sleep(220);
      expect(task3.exec).toHaveBeenCalled();
      expect(task1.status).toBe("completed");
      expect(task2.status).toBe("completed");
      expect(task3.status).toBe("running");

      await sleep(200);
      expect(task3.status).toBe("completed");
    });
    it("should auto start after task-error event", async () => {
      class FFmpegTask extends AbstractTask {
        type: string = TaskType.ffmpeg;
        exec = vi.fn().mockImplementation(async () => {
          this.status = "running";
          await sleep(200);
          this.emitter.emit("task-error", { taskId: this.taskId, error: "test" });
          this.status = "error";
        });
        pause = vi.fn();
        resume = vi.fn();
        kill = vi.fn();
      }

      const task1 = new FFmpegTask();
      const task2 = new FFmpegTask();
      const task3 = new FFmpegTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).not.toHaveBeenCalled();
      await sleep(220);
      expect(task3.exec).toHaveBeenCalled();

      expect(task1.status).toBe("error");
      expect(task2.status).toBe("error");
      expect(task3.status).toBe("running");

      await sleep(200);
      expect(task3.status).toBe("error");
    });

    it("should auto start after task-pause event", async () => {
      class FFmpegTask extends AbstractTask {
        type: string = TaskType.ffmpeg;
        exec = vi.fn().mockImplementation(async () => {
          this.status = "running";
          await sleep(200);
        });
        pause = vi.fn().mockImplementation(() => {
          this.status = "paused";
          this.emitter.emit("task-pause", { taskId: this.taskId });
        });
        resume = vi.fn();
        kill = vi.fn();
      }

      const task1 = new FFmpegTask();
      const task2 = new FFmpegTask();
      const task3 = new FFmpegTask();
      taskQueue.addTask(task1, false);
      taskQueue.addTask(task2, false);
      taskQueue.addTask(task3, false);
      expect(task1.exec).toHaveBeenCalled();
      expect(task2.exec).toHaveBeenCalled();
      expect(task3.exec).not.toHaveBeenCalled();
      task1.pause();
      await sleep(210);
      expect(task3.exec).toHaveBeenCalled();
    });
  });
});
