import { expect, describe, it } from "vitest";
import { uuid } from "../src/utils/index";

import { type Options, type Part, type Live } from "../src/main/server/index";
import { expect, describe, it } from "vitest";

export async function handleLiveData(liveData: Live[], options: Options) {
  // 计算live
  const timestamp = new Date(options.time).getTime();
  let currentIndex = -1;
  if (options.event === "FileOpening" || options.event === "VideoFileCreatedEvent") {
    currentIndex = liveData.findIndex((live) => {
      // 找到上一个文件结束时间与当前时间差小于10分钟的直播，认为是同一个直播
      const endTime = Math.max(...live.parts.map((item) => item.endTime || 0));

      console.log(endTime, (timestamp - endTime) / (1000 * 60));
      return (
        live.roomId === options.roomId &&
        live.platform === options.platform &&
        (timestamp - endTime) / (1000 * 60) < 10
      );
    });
    console.log("currentIndex", currentIndex);
    let currentLive = liveData[currentIndex];
    if (currentLive) {
      const part: Part = {
        partId: uuid(),
        startTime: timestamp,
        filePath: options.filePath,
        status: "recording",
      };
      if (currentLive.parts) {
        currentLive.parts.push(part);
      } else {
        currentLive.parts = [part];
      }
      liveData[currentIndex] = currentLive;
    } else {
      // 新建Live数据
      currentLive = {
        eventId: uuid(),
        platform: options.platform,
        startTime: timestamp,
        roomId: options.roomId,
        videoName: options.title,
        parts: [
          {
            partId: uuid(),
            startTime: timestamp,
            filePath: options.filePath,
            status: "recording",
          },
        ],
      };
      liveData.push(currentLive);
      currentIndex = liveData.length - 1;
    }
  } else {
    currentIndex = liveData.findIndex((live) => {
      return live.parts.findIndex((part) => part.filePath === options.filePath) !== -1;
    });
    let currentLive = liveData[currentIndex];
    if (currentLive) {
      const currentPartIndex = currentLive.parts.findIndex((item) => {
        return item.filePath === options.filePath;
      });
      console.log(
        "currentLive",
        currentIndex,
        currentPartIndex,
        currentLive.parts,
        options.filePath,
      );
      const currentPart = currentLive.parts[currentPartIndex];
      currentPart.endTime = timestamp;
      currentPart.status = "recorded";
      currentLive.parts[currentPartIndex] = currentPart;
      liveData[currentIndex] = currentLive;
    } else {
      currentLive = {
        eventId: uuid(),
        platform: options.platform,
        roomId: options.roomId,
        videoName: options.title,
        parts: [
          {
            partId: uuid(),
            filePath: options.filePath,
            endTime: timestamp,
            status: "recorded",
          },
        ],
      };
      liveData.push(currentLive);
      currentIndex = liveData.length - 1;
    }
  }
}

describe("handleLiveData", () => {
  let liveData: Live[];

  it("event: FileOpening, liveData的情况", async () => {
    liveData = [];
    const options: Options = {
      event: "FileOpening",
      roomId: 123,
      platform: "bili-recorder",
      time: "2022-01-01T00:00:00Z",
      title: "Test Video",
      filePath: "/path/to/video.mp4",
      username: "test",
    };

    await handleLiveData(liveData, options);

    expect(liveData.length).toBe(1);
    expect(liveData[0].eventId).toBeDefined();
    expect(liveData[0].platform).toBe(options.platform);
    expect(liveData[0].startTime).toBe(new Date(options.time).getTime());
    expect(liveData[0].roomId).toBe(options.roomId);
    expect(liveData[0].videoName).toBe(options.title);
    expect(liveData[0].parts.length).toBe(1);
    expect(liveData[0].parts[0].partId).toBeDefined();
    expect(liveData[0].parts[0].startTime).toBe(new Date(options.time).getTime());
    expect(liveData[0].parts[0].filePath).toBe(options.filePath);
    expect(liveData[0].parts[0].status).toBe("recording");
  });

  it("event: FileClosed, liveData的情况", async () => {
    liveData = [];
    const options: Options = {
      event: "FileClosed",
      roomId: 123,
      platform: "bili-recorder",
      time: "2022-01-01T00:00:00Z",
      title: "Test Video",
      filePath: "/path/to/video.mp4",
      username: "test",
    };

    await handleLiveData(liveData, options);

    expect(liveData.length).toBe(1);
    expect(liveData[0].eventId).toBeDefined();
    expect(liveData[0].platform).toBe(options.platform);
    expect(liveData[0].roomId).toBe(options.roomId);
    expect(liveData[0].videoName).toBe(options.title);
    expect(liveData[0].parts.length).toBe(1);
    expect(liveData[0].parts[0].partId).toBeDefined();
    expect(liveData[0].parts[0].filePath).toBe(options.filePath);
    expect(liveData[0].parts[0].status).toBe("recorded");
  });

  it("存在live的情况下，且roomId相同，在限制时间内又进来一条数据", async () => {
    liveData = [];
    const existingLive: Live = {
      eventId: "existing-event-id",
      platform: "bili-recorder",
      startTime: new Date("2022-01-01T00:00:00Z").getTime(),
      roomId: 123,
      videoName: "Existing Video",
      parts: [
        {
          partId: "existing-part-id",
          startTime: new Date("2022-01-01T00:00:00Z").getTime(),
          filePath: "/path/to/existing-video.mp4",
          status: "recording",
          endTime: new Date("2022-01-01T00:05:00Z").getTime(),
        },
      ],
    };
    liveData.push(existingLive);

    const options: Options = {
      event: "VideoFileCreatedEvent",
      roomId: 123,
      platform: "bili-recorder",
      time: "2022-01-01T00:09:00Z",
      title: "New Video",
      filePath: "/path/to/new-video.mp4",
      username: "test",
    };
    await handleLiveData(liveData, options);
    console.log("liveData", liveData, liveData.length);

    expect(liveData.length).toBe(1);
    expect(liveData[0].eventId).toBe(existingLive.eventId);
    expect(liveData[0].platform).toBe(existingLive.platform);
    expect(liveData[0].startTime).toBe(existingLive.startTime);
    expect(liveData[0].roomId).toBe(existingLive.roomId);
    expect(liveData[0].videoName).toBe(existingLive.videoName);
    expect(liveData[0].parts.length).toBe(2);
    expect(liveData[0].parts[0]).toBe(existingLive.parts[0]);
    expect(liveData[0].parts[1].partId).toBeDefined();
    expect(liveData[0].parts[1].startTime).toBe(new Date(options.time).getTime());
    expect(liveData[0].parts[1].filePath).toBe(options.filePath);
    expect(liveData[0].parts[1].status).toBe("recording");
  });
  it("存在live的情况下，且roomId相同，在限制时间外又进来一条数据", async () => {
    liveData = [];
    const existingLive: Live = {
      eventId: "existing-event-id",
      platform: "bili-recorder",
      startTime: new Date("2022-01-01T00:00:00Z").getTime(),
      roomId: 123,
      videoName: "Existing Video",
      parts: [
        {
          partId: "existing-part-id",
          startTime: new Date("2022-01-01T00:00:00Z").getTime(),
          filePath: "/path/to/existing-video.mp4",
          status: "recording",
          endTime: new Date("2022-01-01T00:05:00Z").getTime(),
        },
      ],
    };
    liveData.push(existingLive);

    const options: Options = {
      event: "VideoFileCreatedEvent",
      roomId: 123,
      platform: "bili-recorder",
      time: "2022-01-01T00:16:00Z",
      title: "New Video",
      filePath: "/path/to/new-video.mp4",
      username: "test",
    };
    await handleLiveData(liveData, options);
    console.log("liveData", liveData, liveData.length);

    expect(liveData.length).toBe(2);
    expect(liveData[0].eventId).toBe(existingLive.eventId);
    expect(liveData[0].platform).toBe(existingLive.platform);
    expect(liveData[0].startTime).toBe(existingLive.startTime);
    expect(liveData[0].roomId).toBe(existingLive.roomId);
    expect(liveData[0].videoName).toBe(existingLive.videoName);
    expect(liveData[0].parts.length).toBe(1);
    expect(liveData[0].parts[0]).toBe(existingLive.parts[0]);
    expect(liveData[1].parts[0].partId).toBeDefined();
    // expect(liveData[0].parts[1].startTime).toBe(new Date(options.time).getTime());
    // expect(liveData[0].parts[1].filePath).toBe(options.filePath);
    // expect(liveData[0].parts[1].status).toBe("recording");
  });
  it("存在live的情况下，且roomId相同，在限制时间外又进来一条event: FileClosed数据", async () => {
    liveData = [];
    const existingLive: Live = {
      eventId: "existing-event-id",
      platform: "bili-recorder",
      startTime: new Date("2022-01-01T00:00:00Z").getTime(),
      roomId: 123,
      videoName: "Existing Video",
      parts: [
        {
          partId: "existing-part-id",
          startTime: new Date("2022-01-01T00:00:00Z").getTime(),
          filePath: "/path/to/existing-video.mp4",
          status: "recording",
        },
      ],
    };
    liveData.push(existingLive);

    const options: Options = {
      event: "FileClosed",
      roomId: 123,
      platform: "bili-recorder",
      time: "2022-01-01T00:05:00Z",
      title: "Existing Video",
      filePath: "/path/to/existing-video.mp4",
      username: "test",
    };

    await handleLiveData(liveData, options);

    expect(liveData.length).toBe(1);
    expect(liveData[0].eventId).toBe(existingLive.eventId);
    expect(liveData[0].platform).toBe(existingLive.platform);
    expect(liveData[0].startTime).toBe(existingLive.startTime);
    expect(liveData[0].roomId).toBe(existingLive.roomId);
    expect(liveData[0].videoName).toBe(existingLive.videoName);
    expect(liveData[0].parts.length).toBe(1);
    expect(liveData[0].parts[0].partId).toBe(existingLive.parts[0].partId);
    expect(liveData[0].parts[0].startTime).toBe(existingLive.parts[0].startTime);
    expect(liveData[0].parts[0].filePath).toBe(existingLive.parts[0].filePath);
    expect(liveData[0].parts[0].endTime).toBe(new Date(options.time).getTime());
    expect(liveData[0].parts[0].status).toBe("recorded");
  });
  it("存在live的情况下，且最后一个part的结束时间并非最新，又进来一条event: FileClosed数据", async () => {
    liveData = [];
    const existingLive: Live = {
      eventId: "existing-event-id",
      platform: "bili-recorder",
      startTime: new Date("2022-01-01T00:00:00Z").getTime(),
      roomId: 123,
      videoName: "Existing Video",
      parts: [
        {
          partId: "existing-part-id2",
          startTime: new Date("2022-01-01T00:00:00Z").getTime(),
          filePath: "/path/to/existing-video.mp4",
          status: "recorded",
          endTime: new Date("2022-01-01T00:05:00Z").getTime(),
        },
        {
          partId: "existing-part-id",
          startTime: new Date("2022-01-01T00:00:00Z").getTime(),
          filePath: "/path/to/existing-video.mp4",
          status: "recording",
        },
      ],
    };
    liveData.push(existingLive);

    const options: Options = {
      event: "FileOpening",
      roomId: 123,
      platform: "bili-recorder",
      time: "2022-01-01T00:09:00Z",
      title: "Existing Video",
      filePath: "/path/to/existing-video.mp4",
      username: "test",
    };

    await handleLiveData(liveData, options);

    expect(liveData.length).toBe(1);
    expect(liveData[0].eventId).toBe(existingLive.eventId);
    expect(liveData[0].platform).toBe(existingLive.platform);
    expect(liveData[0].startTime).toBe(existingLive.startTime);
    expect(liveData[0].roomId).toBe(existingLive.roomId);
    expect(liveData[0].videoName).toBe(existingLive.videoName);
    expect(liveData[0].parts.length).toBe(3);
    // expect(liveData[0].parts[0].partId).toBe(existingLive.parts[0].partId);
    // expect(liveData[0].parts[0].startTime).toBe(existingLive.parts[0].startTime);
    // expect(liveData[0].parts[0].filePath).toBe(existingLive.parts[0].filePath);
    // expect(liveData[0].parts[0].endTime).toBe(new Date(options.time).getTime());
    // expect(liveData[0].parts[0].status).toBe("recorded");
  });
});

describe("formatTime", () => {
  it("should format the time correctly", () => {
    const time = "2022-01-01T12:34:56.789Z";
    const result = formatTime(time);
    expect(result).toEqual({
      year: "2022",
      month: "01",
      day: "01",
      now: "2022.01.01",
    });
  });
});

describe("foramtTitle", () => {
  it("should format the title correctly", () => {
    const options = {
      title: "My Title",
      username: "John Doe",
      time: "2022-01-01T12:34:56.789Z",
    };
    const template =
      "Title: {{title}}, User: {{user}}, Date: {{now}}, yyyy: {{yyyy}}, MM: {{MM}}, dd: {{dd}}";
    const result = foramtTitle(options, template);
    expect(result).toBe(
      "Title: My Title, User: John Doe, Date: 2022.01.01, yyyy: 2022, MM: 01, dd: 01",
    );
  });

  it("should trim the title to 80 characters", () => {
    const options = {
      title: "This is a very long title that exceeds 80 characters",
      username: "John Doe",
      time: "2022-01-01T12:34:56.789Z",
    };
    const template = "Title: {{title}}, User: {{user}}, Date: {{now}}";
    const result = foramtTitle(options, template);
    expect(result.length).toBe(80);
  });
});

const formatTime = (time: string) => {
  // 创建一个Date对象
  const timestamp = new Date(time);

  // 提取年、月、日部分
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");

  // 格式化为"YYYY.MM.DD"的形式
  const formattedDate = `${year}.${month}.${day}`;
  return {
    year: String(year),
    month,
    day,
    now: formattedDate,
  };
};

/**
 * 支持{{title}},{{user}},{{now}}占位符，会覆盖预设中的标题，如【{{user}}】{{title}}-{{now}}<br/>
 * 直播标题：{{title}}<br/>
 * 主播名：{{user}}<br/>
 * 当前时间（快速）：{{now}}，示例：2024.01.24<br/>
 * 年：{{yyyy}}<br/>
 * 月（补零）：{{MM}}<br/>
 * 日（补零）：{{dd}}<br/>
 *
 * @param {object} options 格式化参数
 * @param {string} options.title 直播标题
 * @param {string} options.username 主播名
 * @param {string} options.time 直播时间
 * @param {string} template 格式化模板
 */
function foramtTitle(
  options: {
    title: string;
    username: string;
    time: string;
  },
  template: string,
) {
  const { year, month, day, now } = formatTime(options.time);

  const title = template
    .replaceAll("{{title}}", options.title)
    .replaceAll("{{user}}", options.username)
    .replaceAll("{{now}}", now)
    .replaceAll("{{yyyy}}", year)
    .replaceAll("{{MM}}", month)
    .replaceAll("{{dd}}", day)
    .trim()
    .slice(0, 80);

  return title;
}
