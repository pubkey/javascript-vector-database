import { DEFAULT_MODEL_NAME, getVectorFromText } from './vector.js';

onmessage = async (e) => {
    const embedding = await getVectorFromText(e.data.text, DEFAULT_MODEL_NAME);
    postMessage({
        id: e.data.id,
        embedding
    });
};
