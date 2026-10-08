/**
 * Utility Kompresi Citra Bukti Audit Otomatis (Client-Side Auto-Compression).
 * 
 * Standar Audit QAS Motorcycle Logistic:
 * - Mengompresi foto mentah resolusi tinggi smartphone (5 MB - 15 MB / 12MP - 48MP)
 *   menjadi berkas JPEG ringan berkisar 150 KB - 350 KB (~95% penghematan data).
 * - Menjaga ketajaman dokumen, nomor rangka, nomor mesin, dan fisik unit sepeda motor
 *   dengan batas resolusi maksimal 1280 piksel (aspect-ratio preserved).
 * - Menambahkan watermark waktu pengambilan otomatis untuk validitas audit trail.
 */

export interface CompressionOptions {
  /** Maksimal dimensi terpanjang (lebar atau tinggi) dalam piksel. Default: 1280 */
  maxDimension?: number;
  /** Kualitas kompresi JPEG antara 0.1 hingga 1.0. Default: 0.80 */
  quality?: number;
  /** Sertakan watermark timestamp audit di pojok bawah foto. Default: true */
  addWatermark?: boolean;
}

export interface CompressionResult {
  dataUrl: string;
  sizeBytes: number;
  originalSizeBytes: number;
  width: number;
  height: number;
  compressionRatio: number; // e.g. 95.2 (%)
}

/**
 * Mengompresi file foto atau Base64 DataURL secara otomatis di browser.
 */
export async function compressAuditImage(
  source: File | Blob | string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxDimension = 1280,
    quality = 0.80,
    addWatermark = true,
  } = options;

  let originalSizeBytes = 0;
  if (source instanceof File || source instanceof Blob) {
    originalSizeBytes = source.size;
  } else if (typeof source === 'string') {
    originalSizeBytes = Math.round((source.length * 3) / 4);
  }

  // 1. Muat citra ke elemen HTMLImageElement
  const img = await loadImage(source);
  const origWidth = img.naturalWidth || img.width || 1280;
  const origHeight = img.naturalHeight || img.height || 720;

  // 2. Hitung dimensi proporsional baru
  let targetWidth = origWidth;
  let targetHeight = origHeight;

  if (origWidth > maxDimension || origHeight > maxDimension) {
    if (origWidth >= origHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round((origHeight * maxDimension) / origWidth);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round((origWidth * maxDimension) / origHeight);
    }
  }

  // 3. Render ke Canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    // Fallback jika konteks 2D tidak tersedia (misal di mock lingkungan test)
    const fallbackDataUrl = typeof source === 'string' ? source : '';
    return {
      dataUrl: fallbackDataUrl,
      sizeBytes: originalSizeBytes,
      originalSizeBytes,
      width: targetWidth,
      height: targetHeight,
      compressionRatio: 0,
    };
  }

  // Gambar citra utama dengan interpolasi halus
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // 4. Tambahkan Watermark Timestamp Audit Resmi jika diaktifkan
  if (addWatermark) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const watermarkText = `QAS BUKTI • ${dateStr} ${timeStr} WIB (Waktu Perangkat / Preview)`;

    const fontSize = Math.max(12, Math.round(targetWidth / 45));
    ctx.font = `600 ${fontSize}px sans-serif`;
    const textMetrics = ctx.measureText(watermarkText);
    const paddingX = 10;
    const paddingY = 6;
    const bannerWidth = textMetrics.width + paddingX * 2;
    const bannerHeight = fontSize + paddingY * 2;

    const posX = targetWidth - bannerWidth - 12;
    const posY = targetHeight - bannerHeight - 12;

    // Background banner semi-transparan
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(posX, posY, bannerWidth, bannerHeight, 6);
    } else {
      ctx.rect(posX, posY, bannerWidth, bannerHeight);
    }
    ctx.fill();

    // Teks watermark
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(watermarkText, posX + paddingX, posY + bannerHeight / 2);
  }

  // 5. Ekspor ke format JPEG dengan kualitas terkompresi
  const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
  const compressedSizeBytes = Math.round((compressedDataUrl.length * 3) / 4);

  const compressionRatio =
    originalSizeBytes > 0 && compressedSizeBytes < originalSizeBytes
      ? Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100)
      : 0;

  return {
    dataUrl: compressedDataUrl,
    sizeBytes: compressedSizeBytes,
    originalSizeBytes,
    width: targetWidth,
    height: targetHeight,
    compressionRatio,
  };
}

/**
 * Helper untuk memuat File, Blob, atau string dataURL ke HTMLImageElement.
 */
function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Gagal memuat citra: ${err}`));

    if (typeof source === 'string') {
      img.src = source;
    } else {
      const url = URL.createObjectURL(source);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.src = url;
    }
  });
}
