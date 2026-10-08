import { describe, it, expect, vi } from 'vitest';
import { compressAuditImage } from '../../src/lib/imageCompression';

describe('Audit Evidence Auto-Compression Matrix', () => {
  it('handles fallback gracefully when canvas context is unavailable in headless environments', async () => {
    // In headless test environments (jsdom without canvas mock), getContext('2d') returns null
    const dummyDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...';
    
    // Mock Image object
    const mockImage = {
      naturalWidth: 4032,
      naturalHeight: 3024,
      width: 4032,
      height: 3024,
      crossOrigin: '',
      src: '',
      onload: () => {},
      onerror: () => {},
    };

    vi.spyOn(window, 'Image').mockImplementation(() => {
      setTimeout(() => {
        if (mockImage.onload) mockImage.onload();
      }, 5);
      return mockImage as unknown as HTMLImageElement;
    });

    const result = await compressAuditImage(dummyDataUrl, {
      maxDimension: 1280,
      quality: 0.80,
      addWatermark: true,
    });

    expect(result).toBeDefined();
    // Calculated proportional target dimensions for a 4032x3024 4:3 photo
    expect(result.width).toBe(1280);
    expect(result.height).toBe(960);
    expect(result.dataUrl).toBeDefined();
  });

  it('correctly calculates proportional dimensions for portrait smartphone photos (3024x4032)', async () => {
    const dummyDataUrl = 'data:image/jpeg;base64,/9j/portrait...';
    
    const mockImage = {
      naturalWidth: 3024,
      naturalHeight: 4032,
      width: 3024,
      height: 4032,
      crossOrigin: '',
      src: '',
      onload: () => {},
      onerror: () => {},
    };

    vi.spyOn(window, 'Image').mockImplementation(() => {
      setTimeout(() => {
        if (mockImage.onload) mockImage.onload();
      }, 5);
      return mockImage as unknown as HTMLImageElement;
    });

    const result = await compressAuditImage(dummyDataUrl, {
      maxDimension: 1280,
      quality: 0.80,
      addWatermark: true,
    });

    // Max dimension should be 1280 on the height
    expect(result.height).toBe(1280);
    expect(result.width).toBe(960);
  });
});
