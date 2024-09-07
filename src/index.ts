import './style.css';
import { createDatabase, euclideanDistance, sortByObjectNumberProperty } from './database.js';
import { getVectorFromTextWithWorker } from './worker-scheduler.js';
import { ensureNotFalsy, getFromMapOrThrow, randomOfArray } from 'rxdb/plugins/core';
import { WIKI_DATA } from './data.js';
import { getVectorFromText, modelNames } from './vector.js';


async function run() {
    const db = await createDatabase();


    let t = performance.now();
    function time(ctx: string) {
        const diff = performance.now() - t;
        t = performance.now();
        console.log('time(' + ctx + ') ' + diff);
        return diff;
    };

    const $queryInput: HTMLInputElement = ensureNotFalsy(document.getElementById('query-input')) as any;
    const $queryButton = ensureNotFalsy(document.getElementById('query-button'));
    const $queryString = ensureNotFalsy(document.getElementById('query-string'));
    const $list = ensureNotFalsy(document.getElementById('list'));
    $queryButton.onclick = () => {
        const searchString = $queryInput.value;
        submit(searchString);
    }
    async function submit(searchString: string) {
        $queryString.innerHTML = 'QUERY STRING: ' + searchString;
        $list.innerHTML = '';
        // const searchString = randomOfArray(WIKI_DATA).body;
        time('START create search embedding ' + performance.now());
        const searchEmbedding = await getVectorFromTextWithWorker(searchString);
        time('DONE create search embedding ' + performance.now());


        // TEST embedding creation speed per model
        // for (const modelName of modelNames) {
        //     let embeddingTime = 0;
        //     const testEmbeddingAmount = 1;
        //     const searchEmbeddingPrepare = await getVectorFromText(randomOfArray(WIKI_DATA).body, modelName);
        //     for (let i = 0; i < testEmbeddingAmount; i++) {
        //         time('START create search embedding model: ' + modelName);
        //         const searchEmbedding2 = await getVectorFromText(randomOfArray(WIKI_DATA).body, modelName);
        //         embeddingTime += time('DONE create search embedding2 mode: ' + modelName);
        //     }
        //     console.log('embeddingTime(' + testEmbeddingAmount + ') ' + modelName + ' AVG: ' + Math.round(embeddingTime / testEmbeddingAmount));
        //     console.log('vector size ' + modelName + ': ' + searchEmbeddingPrepare.length);
        // }

        // time('START SEARCH vectorSearchFullScan ' + performance.now());
        // const resultFullScan = await (db.vectors as any).vectorSearchFullScan(searchEmbedding);
        // const queryResultFullScanTime = time('DONE SEARCH vectorSearchFullScan ' + performance.now());
        // console.dir({ resultFullScan });

        time('START SEARCH vectorSearchIndexRange ' + performance.now());
        const resultLimit = await (db.vectors as any).vectorSearchIndexRange(searchEmbedding);
        const resultLimitTime = time('DONE SEARCH vectorSearchIndexRange ' + performance.now());
        console.dir({ resultLimit });

        // time('START SEARCH vectorSearchIndexSimilarity ' + performance.now());
        // const result = await (db.vectors as any).vectorSearchIndexSimilarity(searchEmbedding);
        // const resultSearchRangeTime = time('DONE SEARCH vectorSearchIndexSimilarity ' + performance.now());
        // console.dir({ result });

        // console.dir({
        //     queryResultFullScan: resultFullScan.result.map((d: any) => d.distance),
        //     queryResultFullScanTime,
        //     resultSearchRange: result.result.map((d: any) => d.distance),
        //     resultSearchRangedocReads: result.docReads,
        //     resultSearchRangeTime,
        //     resultLimit: resultLimit.result.map((d: any) => d.distance),
        //     resultLimitDocReads: resultLimit.docReads,
        //     resultLimitTime
        // });

        const sourceDocs = await db.items.findByIds(resultLimit.result.map((r: any) => r.doc.primary)).exec();
        $list.innerHTML = resultLimit.result.map((r: any) => {
            const doc = getFromMapOrThrow(sourceDocs, r.doc.primary);
            return '<li>' + doc.body + '</li> <hr />';
        }).join('');
    }

    await submit($queryInput.value);

}
run();
