import { pipeline } from "@xenova/transformers";

/**
 * You can try different models:
 * @link https://huggingface.co/models?pipeline_tag=feature-extraction&library=transformers.js
 */
const modelName = 'Xenova/all-MiniLM-L6-v2';
// const modelName = 'Supabase/gte-small';

const pipePromise = pipeline(
  "feature-extraction",
  // format: huggingfaceUsername+huggingfaceRepositoryName
  modelName,
  {
    device: 'webgpu'
  } as any
);

export async function getVectorFromText(text: string): Promise<number[]> {
  const pipe = await pipePromise;
  const output = await pipe(text, {
    pooling: "mean",
    normalize: true,
  });
  const embedding = Array.from(output.data);
  return embedding as any;
}
