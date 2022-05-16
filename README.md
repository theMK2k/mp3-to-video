# MP3 to Video

Convert mp3 file/s to mp4 video/s.

## Usage

### Required command line parameters

`--src <path>`: feed a file and it will be converted (only .mp3 files are supported). Feed a directory and all the .mp3 files within it will be converted.

### Optional command line parameters

`-i <path>` or `--image <path>`: use the given image for the video. If omitted: **MP3 to Video** will generate an image

`-m` or `--merge`: all files will be merged to one video including chapters. The chapters will be the filename without file extension.

`-v` or `--verbose`: verbose logging

### Examples

#### 1. Convert all .mp3 files to a video each, generate the image from the filename

```bash
node mp3-to-video.js --src /path/to/file/or/directory
```

#### 2. Merge all .mp3 files within a directory and convert them to a single video, generate the image from the directory name

```bash
node mp3-to-video.js --merge --src /path/to/file/or/directory
```
