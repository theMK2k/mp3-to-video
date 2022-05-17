const path = require("path");
const util = require("util");
const child_process = require("child_process");

const logger = require("loglevel");
const commandLineArgs = require("command-line-args");
const nodeHtmlToImage = require("node-html-to-image");
const fsExtra = require("fs-extra");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const execa = require("execa");

const execAsync = util.promisify(child_process.exec);

const optionDefinitions = [
  { name: "verbose", alias: "v", type: Boolean },
  { name: "src", type: String, defaultOption: true },
  { name: "merge", alias: "m", type: Boolean },
  { name: "image", alias: "i" },
];

const options = commandLineArgs(optionDefinitions);

if (options.verbose) {
  logger.setLevel(0);
} else {
  logger.setLevel(2);
}

logger.log(options);

if (!options.src) {
  logger.error("--src is missing!");
  process.exit(0);
}

async function textToPng(text, fullPath) {
  logger.log("  running textToPng...");

  await nodeHtmlToImage({
    output: fullPath,
    html: `
<html>
    <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" integrity="sha512-wnea99uKIC3TJF7v4eKk4Y+lMz2Mklv18+r4na2Gn1abDRPPOeef95xTzdwGD9e6zXJBteMIhZ1+68QC5byJZw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    </head>
    <body style="width: 1920px; height: 1080px; background: #000000; color: #FFFFFF; text-align: center; display: flex; justify-content: center;  align-items: center; height: 1080px; font-size: 46">
        <div>
            {{text}}
        </div>
    </body>
</html>
`,
    content: { text },
  });
}

async function processMergeFiles(cwd, files, imagePath) {
  let concatList = "";
  let ffmpegMetadata = "";
  let youtubeChapters = "▬ Chapters ▬▬▬▬▬▬▬▬▬▬";
  let totalRuntime = 0;

  for (let file of files) {
    const fullPath = path.join(cwd, file);

    logger.log("fullPath:", fullPath);

    const stat = await fsExtra.stat(fullPath);
    if (stat.isDirectory()) {
      logger.info("skipping directory", file);
      continue;
    }

    const extension = path.extname(fullPath).toLowerCase();
    if (![".mp3"].find((ext) => ext === extension)) {
      logger.info("skipping non-mp3 file", file);
      continue;
    }

    logger.info("adding to merge list:", file);

    concatList += `${concatList ? "|" : "concat:"}${fullPath}`;

    const runtimeMs = await getRuntime(fullPath);
    ffmpegMetadata += `
[CHAPTER]
TIMEBASE=1/1000
START=${totalRuntime + 1}
END=${totalRuntime + runtimeMs}
title=${path.parse(file).name}
`;

    youtubeChapters += `
${getTimeString(parseInt(totalRuntime / 1000))} - ${
      path.parse(file).name
    }`;

    totalRuntime += runtimeMs;
  }

  if (!concatList) {
    logger.error("Error: no files to process!");
  }

  ffmpegMetadata = `;FFMETADATA1${ffmpegMetadata}`;

  const albumName = path.basename(cwd);
  logger.info("album name:", albumName);

  const chaptersFullpath = path.join(cwd, `${albumName}.txt`);
  await fsExtra.writeFile(chaptersFullpath, ffmpegMetadata);

  const youtubeChaptersFullpath = path.join(cwd, `${albumName}-Youtube_Chapters.txt`);
  await fsExtra.writeFile(youtubeChaptersFullpath, youtubeChapters);

  if (!imagePath) {
    await textToPng(albumName, imagePath);
    imagePath = path.join(cwd, `${albumName}.png`);
  }

  const outFullPath = path.join(cwd, `${albumName}.mp4`);

  if (await fsExtra.exists(outFullPath)) {
    fsExtra.rm(outFullPath, { force: true });
  }

  logger.info("generating merged video:", outFullPath);
  await generateVideo(concatList, imagePath, outFullPath, chaptersFullpath);
}

async function processSingleFiles(cwd, files, imagePath) {
  for (let file of files) {
    const fullPath = path.join(cwd, file);

    logger.log("fullPath:", fullPath);

    const stat = await fsExtra.stat(fullPath);
    if (stat.isDirectory()) {
      logger.info("skipping directory", file);
      continue;
    }

    const extension = path.extname(fullPath).toLowerCase();
    if (![".mp3"].find((ext) => ext === extension)) {
      logger.info("skipping non-mp3 file", file);
      continue;
    }

    await processSingleFile(cwd, file, imagePath);
  }
}

async function generateVideo(
  audioFullpath,
  pngFullpath,
  outFullpath,
  chaptersFullpath
) {
  logger.log("  generateVideo ffmpeg location:", ffmpegPath);

  if (await fsExtra.exists(outFullpath)) {
    fsExtra.rm(outFullpath, { force: true });
  }

  // ffmpeg -loop 1 -framerate 2 -i <pngFullpath> -i <audioFullpath> -c:v libx264 -preset medium -tune stillimage -crf 18 -c:a copy -shortest -pix_fmt yuv420p -s:v 1920x1080 <outFullpath>
  const { stdout } = await execAsync(
    `"${ffmpegPath}" -loop 1 -framerate 2 -i "${pngFullpath}" -i "${audioFullpath}" ${
      chaptersFullpath
        ? ` -i "${chaptersFullpath}" -map_metadata 1 -codec copy`
        : ""
    } -c:v libx264 -preset medium -tune stillimage -crf 18 -c:a copy -shortest -pix_fmt yuv420p -s:v 1920x1080 "${outFullpath}"`
  );

  // const { stdout } = await execa(ffmpegPath, [
  //   "-loop",
  //   "1",
  //   "-framerate",
  //   "2",
  //   "-i",
  //   pngFullpath,
  //   "-i",
  //   audioFullpath,
  //   "-c:v",
  //   "libx264",
  //   "-preset",
  //   "medium",
  //   "-tune",
  //   "stillimage",
  //   "-crf",
  //   "18",
  //   "-c:a",
  //   "copy",
  //   "-shortest",
  //   "-pix_fmt",
  //   "yuv420p",
  //   "-s:v",
  //   "1920x1080",
  //   outFullpath,
  // ]);
}

async function getRuntime(fullPath) {
  // ffprobe -i <fullPath> -show_entries format=duration -v quiet -of csv="p=0"

  const { stdout } = await execAsync(
    `"${ffprobePath}" -i "${fullPath}" -show_entries format=duration -v quiet -of csv="p=0"`
  );

  const floatRuntime = parseFloat(stdout);

  return parseInt(floatRuntime * 1000);
}

async function processSingleFile(cwd, file, imagePath) {
  logger.info("processing file", file);

  const nameWithoutExtension = path.parse(file).name;

  logger.log("  nameWithoutExtension:", nameWithoutExtension);

  if (!imagePath) {
    await textToPng(
      nameWithoutExtension,
      path.join(cwd, `${nameWithoutExtension}.png`)
    );
    imagePath = path.join(cwd, `${albumName}.png`);
  }

  await generateVideo(
    path.join(cwd, file),
    imagePath,
    path.join(cwd, `${nameWithoutExtension}.mp4`)
  );
}

function getTimeString(runtimeSeconds) {
  let result = "";

  if (typeof runtimeSeconds !== "number") {
    return "";
  }

  const hours = Math.floor(runtimeSeconds / (60 * 60));
  if (hours > 0) {
    result += `${hours}:`;
  }

  const minutes = Math.floor(runtimeSeconds / 60) % 60;
  result += `${minutes < 10 ? "0" + minutes : minutes}:`;

  const seconds = runtimeSeconds % 60;
  result += seconds < 10 ? "0" + seconds : seconds;

  return result;
}

(async () => {
  try {
    const src = options.src;

    const srcStat = await fsExtra.stat(src);

    logger.log("srcStat:", srcStat);

    logger.log("srcStat.isDirectory():", srcStat.isDirectory());
    logger.log("srcStat.isFile():", srcStat.isFile());

    const cwd = srcStat.isDirectory() ? src : path.dirname(src);
    logger.log("cwd:", cwd);

    const files = srcStat.isFile() ? [src] : await fsExtra.readdir(src);

    logger.log("files:", files);

    if (options.merge) {
      await processMergeFiles(cwd, files, options.image);
    } else {
      await processSingleFiles(cwd, files, option.image);
    }
  } catch (err) {
    logger.error("Exception:", err);
  }
})();
