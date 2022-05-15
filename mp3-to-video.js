const path = require("path");

const logger = require("loglevel");
const commandLineArgs = require("command-line-args");
const nodeHtmlToImage = require("node-html-to-image");
const fsExtra = require("fs-extra");
const ffmpegPath = require("ffmpeg-static");
const execa = require("execa");

const optionDefinitions = [
  { name: "verbose", alias: "v", type: Boolean },
  { name: "src", type: String, defaultOption: true },
];

const options = commandLineArgs(optionDefinitions);

if (options.verbose) {
  logger.setLevel(0);
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

async function processFiles(cwd, files) {
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

    await processFile(cwd, file);
  }
}

async function runFFMPEG(audioFullPath, pngFullPath, outFullPath) {
  logger.log("  runFFMPEG ffmpeg location:", ffmpegPath);

  if (await fsExtra.exists(outFullPath)) {
    fsExtra.rm(outFullPath, { force: true });
  }

  // ffmpeg -loop 1 -framerate 2 -i byu-utah.png -i nfl.mp3 -c:v libx264 -preset medium -tune stillimage -crf 18 -c:a copy -shortest -pix_fmt yuv420p -s:v 1920x1080 byu-utah.mp4
  const { stdout } = await execa(ffmpegPath, [
    "-loop",
    "1",
    "-framerate",
    "2",
    "-i",
    pngFullPath,
    "-i",
    audioFullPath,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-tune",
    "stillimage",
    "-crf",
    "18",
    "-c:a",
    "copy",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    "-s:v",
    "1920x1080",
    outFullPath,
  ]);
}

async function processFile(cwd, file) {
  logger.info("processing file", file);

  const nameWithoutExtension = path.parse(file).name;

  logger.log("  nameWithoutExtension:", nameWithoutExtension);

  await textToPng(
    nameWithoutExtension,
    path.join(cwd, `${nameWithoutExtension}.png`)
  );

  await runFFMPEG(
    path.join(cwd, file),
    path.join(cwd, `${nameWithoutExtension}.png`),
    path.join(cwd, `${nameWithoutExtension}.mp4`)
  );
}

(async () => {
  try {
    const src = options.src;

    const srcStat = await fsExtra.stat(src);

    logger.log("srcStat:", srcStat);

    logger.log("srcStat.isDirectory():", srcStat.isDirectory());
    logger.log("srcStat.isFile():", srcStat.isFile());

    //   await textToPng(
    //     "Pete Cannon - 90's beats (Band of gold) - Pete Cannon - 90's beats (band of gold) - 01 You fakin it buddy!"
    //   );

    const cwd = srcStat.isDirectory() ? src : path.dirname(src);
    logger.log("cwd:", cwd);

    const files = srcStat.isFile() ? [src] : await fsExtra.readdir(src);

    logger.log("files:", files);

    await processFiles(cwd, files);
  } catch (err) {
    logger.error("Exception:", err);
  }
})();
