import fs from "fs-extra";

import Client from "biliAPI";
import { BILIUP_COOKIE_PATH } from "./appConstant";
import { type IpcMainInvokeEvent } from "electron";

type ClientInstance = InstanceType<typeof Client>;

const client = new Client();
client.loadCookieFile(BILIUP_COOKIE_PATH);

async function loadCookie() {
  if (await fs.pathExists(BILIUP_COOKIE_PATH)) {
    await client.loadCookieFile(BILIUP_COOKIE_PATH);
  }
}

async function getArchives(
  _event: IpcMainInvokeEvent,
  params: Parameters<ClientInstance["getArchives"]>[0],
): ReturnType<ClientInstance["getArchives"]> {
  await loadCookie();
  return client.getArchives(params);
}

export default {
  getArchives,
};