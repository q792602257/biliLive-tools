import { join, parse } from "path";
import os from "os";
import fs from "fs-extra";
import ffmpeg from "@renmu/fluent-ffmpeg";
import { timemarkToSeconds } from "@renmu/fluent-ffmpeg/lib/utils.js";

import { appConfig } from "../index.js";
import {
  escaped,
  genFfmpegParams,
  pathExists,
  trashItem,
  uuid,
  executeCommand,
  formatFile,
  getHardwareAcceleration,
} from "../utils/index.js";
import log from "../utils/log.js";
import { taskQueue, FFmpegTask } from "./task.js";

import type {
  File,
  FfmpegOptions,
  VideoMergeOptions,
  Video2Mp4Options,
} from "@biliLive-tools/types";
import type Ffmpeg from "@biliLive-tools/types/ffmpeg.js";

export const getFfmpegPath = () => {
  const config = appConfig.getAll();
  let ffmpegPath = config.ffmpegPath;
  let ffprobePath = config.ffprobePath;
  if (!config.customExecPath) {
    ffmpegPath = process.env.BILILIVE_FFMPEG_PATH as string;
    ffprobePath = process.env.BILILIVE_FFPROBE_PATH as string;
  }
  return {
    ffmpegPath,
    ffprobePath,
  };
};

export const setFfmpegPath = async () => {
  const { ffmpegPath, ffprobePath } = getFfmpegPath();

  log.info("setFfmpegPath", ffmpegPath, ffprobePath);
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
};

export const readVideoMeta = async (input: string): Promise<Ffmpeg.FfprobeData> => {
  await setFfmpegPath();
  return new Promise((resolve, reject) => {
    ffmpeg(input).ffprobe(function (err, metadata) {
      if (err) {
        reject(err);
      } else {
        resolve(metadata);
      }
    });
  });
};

export const readNbFrames = async (input: string): Promise<number> => {
  const config = appConfig.getAll();
  const command = `${config.ffprobePath} -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "${input}"`;
  const nbFrames = await executeCommand(command);
  return Number(nbFrames) || 0;
};

export const getAvailableEncoders = async () => {
  await setFfmpegPath();
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableEncoders(function (err, codecs) {
      if (err) {
        reject(err);
      } else {
        resolve(codecs);
      }
    });
  });
};

export const convertImage2Video = async (
  inputDir: string,
  output: string,
  options: {
    removeOrigin: boolean;
    internal?: number;
  },
) => {
  await setFfmpegPath();
  const command = ffmpeg(`${inputDir}\\%4d.png`)
    .inputOption("-r", `1/${options.internal || 30}`)
    .output(output);
  const task = new FFmpegTask(
    command,
    {
      output,
      name: `高能进度条: ${output}`,
    },
    {
      onProgress(progress) {
        if (progress.percent) {
          progress.percentage = progress.percent;
        }
        return progress;
      },
      onEnd: async () => {
        if (options.removeOrigin && (await pathExists(inputDir))) {
          log.info("convertImage2Video, remove origin file", inputDir);
          fs.rm(inputDir, { recursive: true, force: true });
        }
      },
    },
  );

  taskQueue.addTask(task, true);
  return task;
};

export const convertVideo2Mp4 = async (
  file: {
    input: string;
    output?: string;
  },
  options: Video2Mp4Options = {
    saveRadio: 1,
    saveOriginPath: true,
    savePath: "",

    override: false,
    removeOrigin: false,
  },
  ffmpegOptions: FfmpegOptions = {
    encoder: "copy",
    audioCodec: "copy",
  },
  autoStart = false,
) => {
  await setFfmpegPath();

  // 相同文件覆盖提示
  const { name, path, dir } = formatFile(file.input);

  let outputName = file.output;
  if (!outputName) {
    outputName = `${name}.mp4`;
  } else {
    outputName = `${outputName}.mp4`;
  }

  let output = join(dir, outputName);
  if (options.saveRadio === 2 && options.savePath) {
    output = join(options.savePath, `${outputName}`);
  }

  const input = path;
  if (!(await pathExists(input))) {
    log.error("convertVideo2Mp4, file not exist", input);
    throw new Error("输入文件不存在");
  }
  if (!options.override && (await pathExists(output))) {
    log.error("convertVideo2Mp4, 文件已存在，跳过", input);
    throw new Error("目标文件已存在");
  }

  const command = ffmpeg(input).output(output);

  // 硬件解码
  if (ffmpegOptions.decode) {
    if (["nvenc"].includes(getHardwareAcceleration(ffmpegOptions.encoder))) {
      command.inputOptions("-hwaccel cuda");
      command.inputOptions("-hwaccel_output_format cuda");
      command.inputOptions("-extra_hw_frames 10");
    }
  }
  const ffmpegParams = genFfmpegParams(ffmpegOptions);

  ffmpegParams.forEach((param) => {
    command.outputOptions(param);
  });

  const task = new FFmpegTask(
    command,
    {
      output,
      name: `转码任务: ${name}`,
    },
    {
      onProgress(progress) {
        if (progress.percent) {
          progress.percentage = progress.percent;
        }
        return progress;
      },
      onEnd: async () => {
        if (options.removeOrigin && (await pathExists(input))) {
          log.info("convertVideo2Mp4, remove origin file", input);
          await trashItem(input);
        }
      },
    },
  );

  taskQueue.addTask(task, autoStart);
  return task;
};

/**
 * 生成弹幕压制相关的ffmpeg命令
 * @param {object} files 文件相关
 * @param {string} files.videoFilePath 视频文件路径
 * @param {string} files.assFilePath 弹幕文件路径，不能有空格
 * @param {string} files.outputPath 输出文件路径
 * @param {object} ffmpegOptions ffmpeg参数
 */
export const genMergeAssMp4Command = (
  files: {
    videoFilePath: string;
    assFilePath: string | undefined;
    outputPath: string;
    hotProgressFilePath: string | undefined;
  },
  ffmpegOptions: FfmpegOptions = {
    encoder: "libx264",
    audioCodec: "copy",
  },
) => {
  const command = ffmpeg(files.videoFilePath).output(files.outputPath);

  const assFile = files.assFilePath;
  if (assFile) {
    if (files.hotProgressFilePath) {
      command.input(files.hotProgressFilePath);
      command.complexFilter([
        {
          filter: "subtitles",
          options: `${escaped(assFile)}`,
          inputs: "0:v",
          outputs: "i",
        },
        {
          filter: "colorkey",
          options: "black:0.1:0.1",
          inputs: "1",
          outputs: "1d",
        },
        {
          filter: "overlay",
          options: "W-w-0:H-h-0",
          inputs: ["i", "1d"],
        },
      ]);
    } else {
      if (ffmpegOptions.ss) {
        command.inputOptions(`-ss ${ffmpegOptions.ss}`);
        command.inputOptions("-copyts");
      }
      if (ffmpegOptions.to) {
        command.inputOptions(`-to ${ffmpegOptions.to}`);
      }
      command.complexFilter([
        {
          filter: "subtitles",
          options: `${escaped(assFile)}`,
        },
      ]);
    }
  }
  // 硬件解码
  if (ffmpegOptions.decode) {
    if (["nvenc"].includes(getHardwareAcceleration(ffmpegOptions.encoder))) {
      command.inputOptions("-hwaccel cuda");
      command.inputOptions("-hwaccel_output_format cuda");
      command.inputOptions("-extra_hw_frames 10");
    }
  }
  const ffmpegParams = genFfmpegParams(ffmpegOptions);

  ffmpegParams.forEach((param) => {
    command.outputOptions(param);
  });

  return command;
};

/**
 * 弹幕压制
 * @param {object} files 文件相关
 * @param {string} files.videoFilePath 视频文件路径
 * @param {string} files.assFilePath 弹幕文件路径，不能有空格
 * @param {string} files.outputPath 输出文件路径
 * @param {object} options
 * @param {boolean} options.removeOrigin 是否删除原始文件
 * @param {object} ffmpegOptions ffmpeg参数
 */
export const mergeAssMp4 = async (
  files: {
    videoFilePath: string;
    assFilePath: string | undefined;
    outputPath: string;
    hotProgressFilePath: string | undefined;
  },
  options: {
    removeOrigin: boolean;
  } = {
    removeOrigin: false,
  },
  ffmpegOptions: FfmpegOptions = {
    encoder: "libx264",
    audioCodec: "copy",
  },
) => {
  await setFfmpegPath();

  const videoInput = files.videoFilePath;
  const output = files.outputPath;

  if (!(await pathExists(videoInput))) {
    log.error("mergrAssMp4, file not exist", videoInput);
    throw new Error("输入文件不存在");
  }
  const assFile = files.assFilePath;
  const command = genMergeAssMp4Command(files, ffmpegOptions);

  const task = new FFmpegTask(
    command,
    {
      output,
      name: `压制任务:${parse(output).name}`,
    },
    {
      onProgress(progress) {
        if (ffmpegOptions.ss) {
          // 单独计算进度条，根据timemark
          const currentTime = timemarkToSeconds(progress.timemark);
          const duration = ffmpegOptions.to
            ? Number(ffmpegOptions.to) - Number(ffmpegOptions.ss)
            : 0;
          return { ...progress, percentage: Math.round((currentTime / duration) * 100) };
        }
        return progress;
      },
      onEnd: async () => {
        if (options.removeOrigin) {
          if (await pathExists(videoInput)) {
            log.info("mergrAssMp4, remove video origin file", videoInput);
            await trashItem(videoInput);
          }
          if (assFile && (await pathExists(assFile))) {
            log.info("mergrAssMp4, remove ass origin file", assFile);
            await trashItem(assFile);
          }
        }
        if (files.hotProgressFilePath && (await pathExists(files.hotProgressFilePath))) {
          log.info("mergrAssMp4, remove hot progress origin file", assFile);
          await fs.unlink(files.hotProgressFilePath);
        }
      },
      onError: async () => {
        if (files.hotProgressFilePath && (await pathExists(files.hotProgressFilePath))) {
          log.info("mergrAssMp4, remove hot progress origin file", assFile);
          await fs.unlink(files.hotProgressFilePath);
        }
      },
    },
  );
  taskQueue.addTask(task, false);

  return task;
};

export const mergeVideos = async (
  videoFiles: File[],
  options: VideoMergeOptions = {
    savePath: "",
    removeOrigin: false,
  },
) => {
  await setFfmpegPath();

  const output = options.savePath;

  const tempDir = os.tmpdir();
  const fileTxtPath = join(tempDir, `${uuid()}.txt`);
  const fileTxtContent = videoFiles.map((videoFile) => `file '${videoFile.path}'`).join("\n");
  await fs.writeFile(fileTxtPath, fileTxtContent);

  const command = ffmpeg(fileTxtPath)
    .inputOptions("-f concat")
    .inputOptions("-safe 0")
    .videoCodec("copy")
    .audioCodec("copy")
    .output(output);
  const videoMetas = await Promise.all(videoFiles.map((file) => readVideoMeta(file.path)));

  log.debug("videoFiles", videoFiles);
  log.debug("videoMetas", videoMetas);

  let duration = 0;

  for (let i = 0; i < videoMetas.length; i++) {
    const videoMeta = videoMetas[i];
    duration += Number(videoMeta.format.duration);
  }

  const task = new FFmpegTask(
    command,
    {
      output,
      name: `合并视频任务: ${videoFiles[0].name}等文件`,
    },
    {
      onProgress(progress) {
        const currentTime = timemarkToSeconds(progress.timemark);

        return { ...progress, percentage: Math.round((currentTime / duration) * 100) };
      },
      onEnd: async () => {
        fs.remove(fileTxtPath);
        if (options.removeOrigin) {
          for (let i = 0; i < videoFiles.length; i++) {
            const videoInput = videoFiles[i].path;
            if (await pathExists(videoInput)) {
              log.info("mergrAssMp4, remove video origin file", videoInput);
              await trashItem(videoInput);
            }
          }
        }
      },
      onError: async () => {
        fs.remove(fileTxtPath);
      },
    },
  );

  taskQueue.addTask(task, false);
  return {
    status: "success",
    text: "添加到任务队列",
    taskId: task.taskId,
  };
};
