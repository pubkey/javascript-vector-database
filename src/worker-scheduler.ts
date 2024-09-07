import { randomCouchString } from "rxdb/plugins/core";


let workers: Worker[];
export function getWorkers() {
    if (!workers) {
        workers = new Array(navigator.hardwareConcurrency)
            .fill(0)
            .map(() => new Worker(new URL("worker.js", import.meta.url)));
    }
    return workers;
}



let t = 0;
export function getWorker() {
    const worker = getWorkers()[t];
    if (!worker) {
        t = 0;
        return getWorker();
    } else {
        t++;
    }
    return worker;
}


let lastId = 0;
export async function getVectorFromTextWithWorker(text: string): Promise<number[]> {
    const worker = getWorker();
    const id = (lastId++) + '';
    return new Promise<number[]>(res => {
        const listener = (ev: any) => {
            if (ev.data.id === id) {
                res(ev.data.embedding);
                worker.removeEventListener('message', listener);
            }
        };
        worker.addEventListener('message', listener);
        worker.postMessage({
            id,
            text
        });
    });
}
