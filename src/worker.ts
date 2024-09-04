import { getVectorFromText } from './vector.js';

onmessage = async (e) => {
    const embedding = await getVectorFromText(e.data.text);
    postMessage({
        id: e.data.id,
        embedding
    });
};
