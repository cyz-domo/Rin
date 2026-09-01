import "../../test/setup";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { client } from "../../app/runtime";
import { compressImageToWebP, uploadImageFile } from "../image-upload";

let fakeImageSize = { width: 1000, height: 800 };

class FakeImage {
  naturalWidth = fakeImageSize.width;
  naturalHeight = fakeImageSize.height;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function createFakeCanvas(encodedBlob: Blob | null) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: () => undefined,
      getImageData: (_sx: number, _sy: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(180),
      }),
    }),
    toBlob: (callback: BlobCallback) => {
      callback(encodedBlob);
    },
  };
  return canvas as unknown as HTMLCanvasElement;
}

function createFile(sizeInBytes: number, name: string, type: string) {
  return new File([new Uint8Array(sizeInBytes)], name, { type });
}

describe("compressImageToWebP", () => {
  const originalCreateElement = document.createElement.bind(document);
  let fakeCanvas: HTMLCanvasElement;

  beforeEach(() => {
    fakeImageSize = { width: 1000, height: 800 };
    (globalThis as any).Image = FakeImage;
    (URL as any).createObjectURL = () => "blob:mock";
    (URL as any).revokeObjectURL = () => undefined;
    document.createElement = ((tag: string, options?: string) =>
      tag === "canvas" ? fakeCanvas : originalCreateElement(tag, options)) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    delete (globalThis as any).Image;
  });

  it("compresses a large JPEG into a smaller WebP file", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(50 * 1024)], { type: "image/webp" }));
    const original = createFile(200 * 1024, "photo.jpg", "image/jpeg");

    const result = await compressImageToWebP(original);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("image/webp");
    expect(result?.name).toBe("photo.webp");
    expect(result!.size).toBeLessThan(original.size);
  });

  it("keeps the original when the encoded result is larger", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(300 * 1024)], { type: "image/webp" }));
    const original = createFile(200 * 1024, "photo.png", "image/png");

    expect(await compressImageToWebP(original)).toBeNull();
  });

  it("keeps the original when the browser cannot encode WebP (PNG fallback)", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(10)], { type: "image/png" }));
    const original = createFile(200 * 1024, "photo.jpg", "image/jpeg");

    expect(await compressImageToWebP(original)).toBeNull();
  });

  it("skips animated, vector and already-compressed image types", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(10)], { type: "image/webp" }));

    for (const [type, name] of [
      ["image/gif", "anim.gif"],
      ["image/svg+xml", "logo.svg"],
      ["image/webp", "photo.webp"],
    ] as const) {
      expect(await compressImageToWebP(createFile(200 * 1024, name, type))).toBeNull();
    }
  });

  it("skips files below the compressible size threshold", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(10)], { type: "image/webp" }));

    expect(await compressImageToWebP(createFile(1024, "tiny.jpg", "image/jpeg"))).toBeNull();
  });

  it("downscales images above the max dimension", async () => {
    fakeImageSize = { width: 5000, height: 2500 };
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(50 * 1024)], { type: "image/webp" }));
    const original = createFile(200 * 1024, "huge.jpg", "image/jpeg");

    const result = await compressImageToWebP(original);

    expect(result).not.toBeNull();
    const rawCanvas = fakeCanvas as unknown as { width: number; height: number };
    expect(rawCanvas.width).toBe(2560);
    expect(rawCanvas.height).toBe(1280);
  });
});

describe("uploadImageFile", () => {
  const originalCreateElement = document.createElement.bind(document);
  let fakeCanvas: HTMLCanvasElement;

  beforeEach(() => {
    fakeImageSize = { width: 1000, height: 800 };
    (globalThis as any).Image = FakeImage;
    (URL as any).createObjectURL = () => "blob:mock";
    (URL as any).revokeObjectURL = () => undefined;
    document.createElement = ((tag: string, options?: string) =>
      tag === "canvas" ? fakeCanvas : originalCreateElement(tag, options)) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    delete (client.storage as unknown as Record<string, unknown>).upload;
    delete (globalThis as any).Image;
  });

  it("uploads the compressed file and attaches its metadata", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(50 * 1024)], { type: "image/webp" }));
    const original = createFile(200 * 1024, "photo.jpg", "image/jpeg");
    const uploadMock = mock(() =>
      Promise.resolve({ data: { url: "https://cdn.example.com/hash.webp" } }),
    );
    (client.storage as any).upload = uploadMock;

    const result = await uploadImageFile(original);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [uploadedFile, uploadedKey] = uploadMock.mock.calls[0] as [File, string];
    expect(uploadedFile.type).toBe("image/webp");
    expect(uploadedFile.name).toBe("photo.webp");
    expect(uploadedKey).toBe("photo.webp");
    expect(result.url).toBe("https://cdn.example.com/hash.webp");
    expect(result.width).toBe(1000);
    expect(result.height).toBe(800);
    expect(result.blurhash).toBeDefined();
  });

  it("uploads the original file when compression is not applicable", async () => {
    fakeCanvas = createFakeCanvas(new Blob([new Uint8Array(10)], { type: "image/webp" }));
    const original = createFile(1024, "tiny.jpg", "image/jpeg");
    const uploadMock = mock(() =>
      Promise.resolve({ data: { url: "https://cdn.example.com/hash.jpg" } }),
    );
    (client.storage as any).upload = uploadMock;

    const result = await uploadImageFile(original);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [uploadedFile, uploadedKey] = uploadMock.mock.calls[0] as [File, string];
    expect(uploadedFile).toBe(original);
    expect(uploadedKey).toBe("tiny.jpg");
    expect(result.url).toBe("https://cdn.example.com/hash.jpg");
  });
});
