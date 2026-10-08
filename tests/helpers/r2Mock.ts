/* eslint-disable @typescript-eslint/no-explicit-any */
export function createR2Mock(): R2Bucket {
  const store = new Map<string, { data: Uint8Array; metadata: any }>();

  return {
    async put(key: string, value: any, options?: any) {
      let bytes: Uint8Array;
      if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (ArrayBuffer.isView(value)) {
        bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else if (typeof value === 'string') {
        bytes = new TextEncoder().encode(value);
      } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
        bytes = new Uint8Array(await value.arrayBuffer());
      } else if (value && typeof value.getReader === 'function') {
        const reader = value.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          chunks.push(chunk);
        }
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        bytes = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          bytes.set(c, offset);
          offset += c.length;
        }
      } else {
        bytes = new Uint8Array();
      }

      const meta = {
        key,
        size: bytes.byteLength,
        customMetadata: options?.customMetadata,
        httpMetadata: options?.httpMetadata,
        uploaded: new Date(),
      };
      store.set(key, { data: bytes, metadata: meta });
      return meta as any;
    },

    async get(key: string) {
      const item = store.get(key);
      if (!item) return null;
      return {
        key,
        size: item.data.byteLength,
        httpMetadata: item.metadata.httpMetadata,
        customMetadata: item.metadata.customMetadata,
        arrayBuffer: async () =>
          item.data.buffer.slice(
            item.data.byteOffset,
            item.data.byteOffset + item.data.byteLength
          ),
        text: async () => new TextDecoder().decode(item.data),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(item.data);
            controller.close();
          },
        }),
      } as any;
    },

    async head(key: string) {
      const item = store.get(key);
      if (!item) return null;
      return item.metadata as any;
    },

    async delete(keys: string | string[]) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) {
        store.delete(k);
      }
    },
  } as unknown as R2Bucket;
}
