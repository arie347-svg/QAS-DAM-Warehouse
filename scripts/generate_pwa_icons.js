import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.resolve(rootDir, 'public');
const iconsDir = path.resolve(publicDir, 'icons');
const imagesDir = path.resolve(publicDir, 'images');
const sourceLogoPath = path.resolve(rootDir, 'Logo Aplikasi.png');

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

async function generate() {
  console.log('Generating official QAS application icons from "Logo Aplikasi.png"...');

  if (!fs.existsSync(sourceLogoPath)) {
    throw new Error(`Source logo not found at: ${sourceLogoPath}`);
  }

  // 1. icon-512.png (High-resolution square PWA icon)
  await sharp(sourceLogoPath)
    .resize(512, 512, { kernel: 'lanczos3' })
    .png({ quality: 100 })
    .toFile(path.join(iconsDir, 'icon-512.png'));
  console.log('✓ public/icons/icon-512.png (512x512)');

  // 2. icon-192.png (Standard PWA icon)
  await sharp(sourceLogoPath)
    .resize(192, 192, { kernel: 'lanczos3' })
    .png({ quality: 100 })
    .toFile(path.join(iconsDir, 'icon-192.png'));
  console.log('✓ public/icons/icon-192.png (192x192)');

  // 3. apple-touch-icon.png (180x180 for iOS home screen)
  await sharp(sourceLogoPath)
    .resize(180, 180, { kernel: 'lanczos3' })
    .png({ quality: 100 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ public/apple-touch-icon.png (180x180)');

  // 4. icon-maskable-512.png (Adaptive icon for Android with seamless safe-area extension)
  await sharp(sourceLogoPath)
    .extend({ top: 80, bottom: 80, left: 80, right: 80, extendWith: 'copy' })
    .resize(512, 512, { kernel: 'lanczos3' })
    .png({ quality: 100 })
    .toFile(path.join(iconsDir, 'icon-maskable-512.png'));
  console.log('✓ public/icons/icon-maskable-512.png (512x512 maskable)');

  // 5. In-app high-res official logo copy
  await sharp(sourceLogoPath)
    .resize(512, 512, { kernel: 'lanczos3' })
    .png({ quality: 100 })
    .toFile(path.join(imagesDir, 'qas-logo.png'));
  console.log('✓ public/images/qas-logo.png');

  // Also copy to dist if dist exists
  const distIconsDir = path.resolve(rootDir, 'dist/icons');
  const distImagesDir = path.resolve(rootDir, 'dist/images');
  if (fs.existsSync(distIconsDir)) {
    fs.copyFileSync(path.join(iconsDir, 'icon-512.png'), path.join(distIconsDir, 'icon-512.png'));
    fs.copyFileSync(path.join(iconsDir, 'icon-192.png'), path.join(distIconsDir, 'icon-192.png'));
    fs.copyFileSync(path.join(iconsDir, 'icon-maskable-512.png'), path.join(distIconsDir, 'icon-maskable-512.png'));
  }
  if (fs.existsSync(distImagesDir)) {
    fs.copyFileSync(path.join(imagesDir, 'qas-logo.png'), path.join(distImagesDir, 'qas-logo.png'));
  }
  const distAppleTouch = path.resolve(rootDir, 'dist/apple-touch-icon.png');
  if (fs.existsSync(path.dirname(distAppleTouch))) {
    fs.copyFileSync(path.join(publicDir, 'apple-touch-icon.png'), distAppleTouch);
  }

  console.log('Official QAS application icon generation complete!');
}

generate().catch(console.error);
