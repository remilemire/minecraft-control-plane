import yauzl, { type Entry, type ZipFile } from "yauzl";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { z } from "zod";

export function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) reject(error ?? new Error("Cannot open ZIP."));
        else resolve(zip);
      },
    );
  });
}

export async function* zipEntries(zip: ZipFile): AsyncGenerator<Entry> {
  for (;;) {
    const entry = await new Promise<Entry | null>((resolve, reject) => {
      const clean = () => {
        zip.off("entry", onEntry);
        zip.off("end", onEnd);
        zip.off("error", onError);
      };
      const onEntry = (value: Entry) => {
        clean();
        resolve(value);
      };
      const onEnd = () => {
        clean();
        resolve(null);
      };
      const onError = (error: Error) => {
        clean();
        reject(error);
      };
      zip.once("entry", onEntry);
      zip.once("end", onEnd);
      zip.once("error", onError);
      zip.readEntry();
    });
    if (entry === null) return;
    yield entry;
  }
}

export function zipStream(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("Cannot read ZIP entry."));
      else resolve(stream);
    });
  });
}

export async function jarVersion(dataPath: string, name: string): Promise<string> {
  if (!/^[\w.-]+\.jar$/.test(name)) throw new Error("Unsupported server JAR path");
  const zip = await openZip(join(dataPath, name));
  // Keep the listener alive while a stream is open, as well as while advancing entries.
  let zipError: Error | undefined;
  zip.on("error", (error: Error) => {
    zipError = error;
  });
  try {
    for await (const entry of zipEntries(zip)) {
      if (entry.fileName !== "version.json") continue;
      if (entry.uncompressedSize > 1024 * 1024) throw new Error("Oversized version metadata");
      const stream = await zipStream(zip, entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
      if (zipError) throw zipError;
      return z
        .object({ id: z.string().min(1) })
        .parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))).id;
    }
    throw new Error("Missing server version metadata");
  } finally {
    zip.close();
  }
}
