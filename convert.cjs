const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dirs = ['public/assets', 'src/assets'];

async function processImages() {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.png')) {
        const inputPath = path.join(dir, file);
        const outputPath = path.join(dir, file.replace('.png', '.webp'));
        
        console.log(`Converting ${inputPath} to ${outputPath}...`);
        await sharp(inputPath).webp({ quality: 80 }).toFile(outputPath);
      }
    }
  }
  console.log('Conversion complete!');
}

processImages().catch(console.error);
