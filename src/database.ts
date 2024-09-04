import { addRxPlugin, createRxDatabase } from "rxdb/plugins/core";
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
            }
        }
    });


    const sampleVectors = await Promise.all(
        WIKI_DATA.slice(0, 5).map(async (row) => {
            const embedding = await getVectorFromText(row.body);
            return embedding;
        })
    );

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
                    const indexValue = euclideanDistance(sampleVectors[idx], embedding) + '';
                    docData['idx' + idx] = indexValue.slice(0, 10);
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

    return db;
}


// TODO import from rxdb
export function euclideanDistance(A: number[], B: number[]): number {
    return Math.sqrt(A.reduce((sum, a, i) => sum + Math.pow(a - B[i], 2), 0));
}
