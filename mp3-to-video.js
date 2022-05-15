const logger = require("loglevel");
const commandLineArgs = require("command-line-args");
const nodeHtmlToImage = require("node-html-to-image");
const fsExtra = require("fs-extra");

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

async function textToPng(text) {
  await nodeHtmlToImage({
    output: "./image.png",
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
  } catch (err) {
    logger.error("Exception:", err);
  }
})();
