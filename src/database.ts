import {
    RxCollection,
    RxDatabase,
    RxDocument,
    RxState,
    addRxPlugin,
    createRxDatabase,
    ensureNotFalsy

} from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { wrappedValidateAjvStorage } from "rxdb/plugins/validate-ajv";
import { INDEX_VECTORS, getVectorFromText } from './vector.js';
import { RxDBPipelinePlugin } from 'rxdb/plugins/pipeline';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { getVectorFromTextWithWorker } from './worker-scheduler.js';
import { RxDBJsonDumpPlugin } from 'rxdb/plugins/json-dump';
import { RxDBStatePlugin } from 'rxdb/plugins/state';


const indexSchema = {
    type: 'string',
    maxLength: 10
};

let dbPromise: Promise<RxDatabase>;

export async function getDatabase() {
    if (dbPromise) {
        return dbPromise;
    }

    addRxPlugin(RxDBStatePlugin);
    addRxPlugin(RxDBJsonDumpPlugin);
    addRxPlugin(RxDBPipelinePlugin);
    addRxPlugin(RxDBLeaderElectionPlugin);

    dbPromise = (async () => {
        const db = await createRxDatabase({
            name: "mydb",
            storage: getRxStorageDexie()
            // storage: wrappedValidateAjvStorage({
            //     storage: getRxStorageDexie()
            // }),
        });


        (window as any).db = db;

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


        const pipeline = await db.items.addPipeline({
            identifier: 'my-embeddings-pipeline',
            destination: db.vectors,
            batchSize: navigator.hardwareConcurrency,
            // batchSize: 10,
            handler: async (docs: RxDocument<any>[]) => {
                console.log('pipeline handler called with ' + docs.length + ' docs');
                const startTime = performance.now();
                const findById = await db.vectors.storageInstance.findDocumentsById(docs.map(d => d.primary), false);
                const vectorsAlreadyThere = new Set();
                findById.forEach(d => vectorsAlreadyThere.add(d.id));


                console.dir(vectorsAlreadyThere);

                console.log('pipeline handler called with ' + docs.length + ' docs 1');
                await Promise.all(docs.map(async (doc, i) => {
                    if (vectorsAlreadyThere.has(doc.primary)) {
                        console.log('skip');
                        return;
                    }
                    const embedding = await getVectorFromTextWithWorker(doc.body);
                    const docData: any = { id: doc.primary, embedding };
                    new Array(5).fill(0).map((_, idx) => {
                        const indexValue = euclideanDistance(INDEX_VECTORS[idx], embedding);
                        docData['idx' + idx] = indexNrToString(indexValue);
                    });
                    console.log('pipeline handler called with ' + docs.length + ' docs 2');
                    await db.vectors.upsert(docData);
                    console.log('pipeline handler called with ' + docs.length + ' docs 3');
                }));
                const time = performance.now() - startTime;
                console.log('batch(' + docs.length + ') processed in ' + time);
            }
        });

        await pipeline.awaitIdle();

        return db;
    })();

    return dbPromise;
}


export type State = {
    importDone: boolean;
};
let statePromise: Promise<RxState<State>>;
export async function getState() {
    if (!statePromise) {
        statePromise = (async () => {
            const db = await getDatabase();
            return db.addState<State>();
        })();
    }
    return statePromise;

}

export async function importData(importWithEmbeddings: boolean) {
    const $importLoading = ensureNotFalsy(document.getElementById('import-loading'));
    $importLoading.style.display = 'block';

    console.log('importData(' + importWithEmbeddings + ') START');
    const db = await getDatabase();
    const state = await getState();
    console.log('importData(' + importWithEmbeddings + ') START 1');
    const itemCount = await db.items.count().exec();
    console.log('importData(' + importWithEmbeddings + ') START 1.5');
    const vectorCount = await db.vectors.count().exec();
    console.log('importData(' + importWithEmbeddings + ') START 2');
    if (importWithEmbeddings) {
        const response = await fetch('./files/items.json');
        const items = await response.json();
        const embeddingsResponse = await fetch('./files/embeddings.json');
        const embeddings = await embeddingsResponse.json();
        const vectorInsertResult = await db.vectors.bulkInsert(
            embeddings
        );
        console.dir({ vectorInsertResult, embeddings });
        await db.items.bulkInsert(
            items
        );
    } else {
        if (itemCount < 10000) {
            console.log('IMPORTING DATA START');
            const response = await fetch('./files/items.json');
            const items = await response.json();
            const startTime = performance.now();
            const insertResult = await db.items.bulkInsert(
                items
            );
            console.dir(insertResult);
            const time = performance.now() - startTime;
            console.log('IMPORTING DATA DONE ' + time);
            console.log('IMPORTING DATA wait for pipeline START');
            await Promise.all(Array.from(db.vectors.awaitBeforeReads).map(fn => fn()));
            console.log('IMPORTING DATA wait for pipeline DONE');
        }
    }
    console.log('importData(' + importWithEmbeddings + ') DONE');
    await state.set('importDone', () => true);
    $importLoading.style.display = 'none';

}

// TODO import from rxdb
export function euclideanDistance(A: number[], B: number[]): number {
    return Math.sqrt(A.reduce((sum, a, i) => sum + Math.pow(a - B[i], 2), 0));
}


export function indexNrToString(nr: number): string {
    return ((nr * 10) + '').slice(0, 10).padEnd(10, '0');
}


export function sortByObjectNumberProperty<T>(property: keyof T) {
    return (a: T, b: T) => {
        return (b as any)[property] - (a as any)[property];
    }
}
