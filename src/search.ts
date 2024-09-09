import { RxCollection, RxDocument } from 'rxdb/plugins/core';
import { euclideanDistance, indexNrToString, sortByObjectNumberProperty } from './database.js';
import { INDEX_VECTORS } from './vector.js';

export async function vectorSearchFullScan(vectorCollection: RxCollection, searchEmbedding: number[]) {
    const candidates = await vectorCollection.find().exec();
    console.log('after fetch ' + performance.now());
    const withDistance = candidates.map(doc => ({ doc, distance: euclideanDistance(searchEmbedding, doc.embedding) }))
    console.log('after distance ' + performance.now());
    const queryResult = withDistance.slice(0).sort(sortByObjectNumberProperty('distance')).reverse();
    console.log('after sorted ' + performance.now());
    console.dir({ withDistance, queryResult });
    return {
        result: queryResult.slice(0, 10),
        docReads: candidates.length
    };
};

export async function vectorSearchIndexRange(vectorCollection: RxCollection, searchEmbedding: number[]) {
    const indexDistance = 0.003;
    const candidates = new Set<RxDocument>();
    let docReads = 0;
    await Promise.all(
        new Array(5).fill(0).map(async (_, i) => {
            const distanceToIndex = euclideanDistance(INDEX_VECTORS[i], searchEmbedding);

            const range = distanceToIndex * indexDistance;
            const docs = await vectorCollection.find({
                selector: {
                    ['idx' + i]: {
                        $gt: indexNrToString(distanceToIndex - range),
                        $lt: indexNrToString(distanceToIndex + range)
                    }
                },
                sort: [{ ['idx' + i]: 'asc' }],
            }).exec();
            docs.map(d => candidates.add(d));
            docReads = docReads + docs.length;
        })
    );

    const docsWithDistance = Array.from(candidates).map(doc => {
        const distance = euclideanDistance((doc as any).embedding, searchEmbedding);
        return {
            distance,
            doc
        };
    });
    const sorted = docsWithDistance.sort(sortByObjectNumberProperty('distance')).reverse();
    return {
        result: sorted.slice(0, 10),
        docReads
    };
};

export async function vectorSearchIndexSimilarity(vectorCollection: RxCollection, searchEmbedding: number[]) {
    const docsPerIndexSide = 100;
    const candidates = new Set<RxDocument>();
    let docReads = 0;
    await Promise.all(
        new Array(5).fill(0).map(async (_, i) => {
            const distanceToIndex = euclideanDistance(INDEX_VECTORS[i], searchEmbedding);
            const [docsBefore, docsAfter] = await Promise.all([
                vectorCollection.find({
                    selector: {
                        ['idx' + i]: {
                            $lt: indexNrToString(distanceToIndex)
                        }
                    },
                    sort: [{ ['idx' + i]: 'desc' }],
                    limit: docsPerIndexSide
                }).exec(),
                vectorCollection.find({
                    selector: {
                        ['idx' + i]: {
                            $gt: indexNrToString(distanceToIndex)
                        }
                    },
                    sort: [{ ['idx' + i]: 'asc' }],
                    limit: docsPerIndexSide
                }).exec()
            ]);
            // console.dir({
            //     i,
            //     distanceToIndex,
            //     indexString: indexNrToString(distanceToIndex),
            //     docsAfter: docsAfter.map(d => d['idx' + i]),
            //     docsBefore: docsBefore.map(d => d['idx' + i]),
            // });
            docsBefore.map(d => candidates.add(d));
            docsAfter.map(d => candidates.add(d));

            docReads = docReads + docsBefore.length;
            docReads = docReads + docsAfter.length;
        })
    );
    console.log('aaaaaaaaaaaa DONE ' + performance.now());

    const docsWithDistance = Array.from(candidates).map(doc => {
        const distance = euclideanDistance((doc as any).embedding, searchEmbedding);
        return {
            distance,
            doc
        };
    });
    const sorted = docsWithDistance.sort(sortByObjectNumberProperty('distance')).reverse();
    return {
        result: sorted.slice(0, 10),
        docReads
    };
}
