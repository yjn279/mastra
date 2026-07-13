import OpenAI, { toFile } from 'openai';

export interface GenerateRequest {
  prompt: string;
  size: string;
}

export interface EditRequest extends GenerateRequest {
  image: Buffer;
}

/** Image backend used by the generate step. Injected so tests can fake it. */
export interface ImageGenerator {
  generate(req: GenerateRequest): Promise<Buffer>;
  edit(req: EditRequest): Promise<Buffer>;
}

function decode(b64: string | undefined): Buffer {
  if (!b64) throw new Error('gpt-image-2 returned no image data');
  return Buffer.from(b64, 'base64');
}

/** Real backend: OpenAI gpt-image-2 (text-to-image and image edit). The client is created lazily so no API key is needed until a call is made. */
export function createOpenAIImageGenerator(): ImageGenerator {
  const model = 'gpt-image-2';
  let client: OpenAI | undefined;
  const openai = () => (client ??= new OpenAI());
  return {
    async generate({ prompt, size }) {
      const res = await openai().images.generate({ model, prompt, size: size as never });
      return decode(res.data?.[0]?.b64_json);
    },
    async edit({ prompt, size, image }) {
      const file = await toFile(image, 'material.png', { type: 'image/png' });
      const res = await openai().images.edit({ model, image: file, prompt, size: size as never });
      return decode(res.data?.[0]?.b64_json);
    },
  };
}
