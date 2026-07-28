const { Jimp } = require('jimp');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
const TEAL = 0x0d9488ff;

async function makeIcon(size, filename) {
  // Load the source icon (white symbol on transparent)
  const src = await Jimp.read(path.join(__dirname, '..', 'msu-schedule-mobile', 'android', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher_foreground.png'));

  // Create teal background
  const bg = new Jimp({ width: src.bitmap.width, height: src.bitmap.height, color: TEAL });
  bg.composite(src, 0, 0);
  bg.resize({ w: size, h: size });

  await bg.write(path.join(PUBLIC, filename));
  console.log(`✓ ${filename} (${size}x${size})`);
}

async function main() {
  await makeIcon(192, 'icon-192.png');
  await makeIcon(512, 'icon-512.png');
  console.log('Done!');
}

main().catch(console.error);
