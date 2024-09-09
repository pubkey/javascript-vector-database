import './style.css';
import { getDatabase, euclideanDistance, getState, importData } from './database.js';
import { getVectorFromTextWithWorker } from './worker-scheduler.js';
import { RxDatabase, ensureNotFalsy, getFromMapOrThrow, randomOfArray } from 'rxdb/plugins/core';
import { getVectorFromText, modelNames } from './vector.js';
import { vectorSearchFullScan, vectorSearchIndexRange } from './search.js';


async function run() {

    const db = await getDatabase();
    const state = await getState();

    // const exported = await db.vectors.exportJSON();
    // console.log(JSON.stringify(exported.docs.map(d => d)));

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
    const $buttonImportPlain: HTMLButtonElement = ensureNotFalsy(document.getElementById('button-import-plain')) as any;
    const $buttonImportEmbeddings: HTMLButtonElement = ensureNotFalsy(document.getElementById('button-import-embeddings')) as any;
    const $list = ensureNotFalsy(document.getElementById('list'));
    $queryButton.onclick = () => {
        const searchString = $queryInput.value;
        submit(searchString);
    }

    if (state.importDone) {
        $buttonImportEmbeddings.disabled = true;
        $buttonImportPlain.disabled = true;
    }
    $buttonImportPlain.onclick = () => {
        $buttonImportEmbeddings.disabled = true;
        $buttonImportPlain.disabled = true;
        importData(false);
    }
    $buttonImportEmbeddings.onclick = () => {
        $buttonImportEmbeddings.disabled = true;
        $buttonImportPlain.disabled = true;
        importData(true);
    }
    async function submit(searchString: string) {
        if (!state.importDone) {
            alert('Before you can run a query, click on one of the import buttons above to import some data.');
            return;
        }
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
        // const results = await vectorSearchFullScan(db.vectors, searchEmbedding);
        // const queryResultFullScanTime = time('DONE SEARCH vectorSearchFullScan ' + performance.now());
        // console.dir({ results });

        time('START SEARCH vectorSearchIndexRange ' + performance.now());
        const results = await vectorSearchIndexRange(db.vectors, searchEmbedding);
        const resultLimitTime = time('DONE SEARCH vectorSearchIndexRange ' + performance.now());
        console.dir({ results });

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

        const sourceDocs = await db.items.findByIds(results.result.map((r: any) => r.doc.primary)).exec();
        $list.innerHTML = results.result.map((r: any, idx) => {
            const doc = getFromMapOrThrow(sourceDocs, r.doc.primary);
            const textHtml = textToHtml(doc.body, idx + 1);
            return textHtml;
        }).join('');
    }
}
run();



function textToHtml(text: string, nr: number) {
    const title = text.split('Title:')[1].split('Content:')[0].trim();
    const content = text.split('Content:')[1].trim();
    return '<h3><b>' + nr + '.</b> ' + title + '</h3><p>' + content + '</p><hr />';
}
