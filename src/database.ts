import { RxCollection, RxDocument, addRxPlugin, createRxDatabase } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { getVectorFromText } from './vector.js';
import { RxDBPipelinePlugin } from 'rxdb/plugins/pipeline';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { WIKI_DATA } from './data.js';
import { getVectorFromTextWithWorker } from './worker-scheduler.js';
export async function createDatabase() {
    addRxPlugin(RxDBPipelinePlugin);
    addRxPlugin(RxDBLeaderElectionPlugin);
    const db = await createRxDatabase({
        name: "mydb",
        storage: getRxStorageDexie()
        // storage: wrappedValidateAjvStorage({
        //     storage: getRxStorageDexie()
        // }),
    });

    const indexSchema = {
        type: 'string',
        maxLength: 10
    };

    const sampleVectors = await Promise.all(
        WIKI_DATA.slice(0, 5).map(async (row) => {
            const embedding = await getVectorFromTextWithWorker(row.body);
            return embedding;
        })
    );

    await db.addCollections({
        items: {
            schema: {
                "version": 0,
                "primaryKey": "id",
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "maxLength": 100
                    },
                    "body": {
                        "type": "string"
                    }
                },
                "required": [
                    "id",
                    "body"
                ]
            }
        },
        vectors: {
            schema: {
                "version": 0,
                "primaryKey": "id",
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "maxLength": 100
                    },
                    "embedding": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    // index fields
                    "idx0": indexSchema,
                    "idx1": indexSchema,
                    "idx2": indexSchema,
                    "idx3": indexSchema,
                    "idx4": indexSchema
                },
                "required": [
                    "id",
                    "embedding",
                    "idx0",
                    "idx1",
                    "idx2",
                    "idx3",
                    "idx4"
                ],
                "indexes": [
                    "idx0",
                    "idx1",
                    "idx2",
                    "idx3",
                    "idx4"
                ]
            },
            statics: {
                async vectorSearchFullScan(this: RxCollection, searchEmbedding: number[]) {
                    const candidates = await this.find().exec();
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
                },
                async vectorSearchIndexRange(this: RxCollection, searchEmbedding: number[]) {
                    await pipeline.awaitIdle();
                    const indexDistance = 0.003;
                    const candidates = new Set<RxDocument>();
                    let docReads = 0;
                    await Promise.all(
                        new Array(5).fill(0).map(async (_, i) => {
                            const distanceToIndex = euclideanDistance(sampleVectors[i], searchEmbedding);

                            const range = distanceToIndex * indexDistance;
                            const docs = await this.find({
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
                },
                async vectorSearchIndexSimilarity(this: RxCollection, searchEmbedding: number[]) {
                    await pipeline.awaitIdle();

                    const docsPerIndexSide = 100;
                    const candidates = new Set<RxDocument>();
                    let docReads = 0;
                    console.log('aaaaaaaaaaaa ' + performance.now());
                    await Promise.all(
                        new Array(5).fill(0).map(async (_, i) => {
                            const distanceToIndex = euclideanDistance(sampleVectors[i], searchEmbedding);
                            const [docsBefore, docsAfter] = await Promise.all([
                                this.find({
                                    selector: {
                                        ['idx' + i]: {
                                            $lt: indexNrToString(distanceToIndex)
                                        }
                                    },
                                    sort: [{ ['idx' + i]: 'desc' }],
                                    limit: docsPerIndexSide
                                }).exec(),
                                this.find({
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
            }
        }
    });

    const pipeline = await db.items.addPipeline({
        identifier: 'my-embeddings-pipeline',
        destination: db.vectors,
        batchSize: navigator.hardwareConcurrency,
        // batchSize: 10,
        handler: async (docs) => {
            const startTime = performance.now();
            await Promise.all(docs.map(async (doc, i) => {
                const embedding = await getVectorFromTextWithWorker(doc.body);
                // const embedding = await getVectorFromText(doc.body);
                const docData: any = { id: doc.primary, embedding };
                new Array(5).fill(0).map((_, idx) => {
                    const indexValue = euclideanDistance(sampleVectors[idx], embedding);
                    docData['idx' + idx] = indexNrToString(indexValue);
                });
                await db.vectors.upsert(docData);
            }));
            const time = performance.now() - startTime;
            console.log('batch(' + docs.length + ') processed in ' + time);
            console.dir({ time })
        }
    });

    const imported = await db.items.count().exec();
    if (imported !== WIKI_DATA.length) {
        console.log('IMPORTING DATA START');
        const startTime = performance.now();
        const insertResult = await db.items.bulkInsert(
            WIKI_DATA
        );
        console.dir(insertResult);
        const time = performance.now() - startTime;
        console.log('IMPORTING DATA DONE ' + time);
    }

    await pipeline.awaitIdle();


    return db;
}


// TODO import from rxdb
export function euclideanDistance(A: number[], B: number[]): number {
    return Math.sqrt(A.reduce((sum, a, i) => sum + Math.pow(a - B[i], 2), 0));
}


function indexNrToString(nr: number): string {
    return ((nr * 10) + '').slice(0, 10).padEnd(10, '0');
}


export function sortByObjectNumberProperty<T>(property: keyof T) {
    return (a: T, b: T) => {
        return (b as any)[property] - (a as any)[property];
    }
}
