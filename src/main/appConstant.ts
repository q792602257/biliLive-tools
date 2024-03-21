import { app } from "electron";
import { join, dirname } from "node:path";
import fs from "fs-extra";
import log from "../utils/log";

import { __dirname } from "./utils/index";

// @ts-ignore
export const CONFIG_PATH = import.meta.env.VITE_IS_ZIP
  ? join(app.getAppPath(), "setting")
  : app.getPath("userData");
fs.ensureDir(CONFIG_PATH);

export const BASE_EXEC_PATH =
  // @ts-ignore
  import.meta.env.VITE_IS_ZIP && import.meta.env.PROD
    ? join(app.getAppPath(), "./resources/app.asar.unpacked/resources/bin")
    : join(__dirname, "../../resources/bin").replace("app.asar", "app.asar.unpacked");

export const BILIUP_COOKIE_PATH = join(CONFIG_PATH, "cookies.json");
export const UPLOAD_PRESET_PATH = join(CONFIG_PATH, "presets.json");
export const DANMU_PRESET_PATH = join(CONFIG_PATH, "danmu_presets.json");
export const FFMPEG_PRESET_PATH = join(CONFIG_PATH, "ffmpeg_presets.json");

export const BILIUP_PATH = join(BASE_EXEC_PATH, "biliup.exe");
export const DANMUKUFACTORY_PATH = join(BASE_EXEC_PATH, "DanmakuFactory.exe");
export const FFMPEG_PATH =
  // @ts-ignore
  import.meta.env.VITE_IS_ZIP && import.meta.env.PROD
    ? join("resources", "app.asar.unpacked", "resources", "bin", "ffmpeg.exe")
    : join(
        dirname(app.getPath("exe")),
        "resources",
        "app.asar.unpacked",
        "resources",
        "bin",
        "ffmpeg.exe",
      );

export const FFPROBE_PATH =
  // @ts-ignore
  import.meta.env.VITE_IS_ZIP && import.meta.env.PROD
    ? join("resources", "app.asar.unpacked", "resources", "bin", "ffprobe.exe")
    : join(
        dirname(app.getPath("exe")),
        "resources",
        "app.asar.unpacked",
        "resources",
        "bin",
        "ffprobe.exe",
      );

log.debug(
  "dasdsadasdsad",
  // @ts-ignore
  import.meta.env,
  import.meta.env.PROD,
  CONFIG_PATH,
  BILIUP_PATH,
  __dirname,
  BASE_EXEC_PATH,
  FFPROBE_PATH,
);
