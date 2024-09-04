import { randomCouchString } from "rxdb/plugins/core";


let workers: Promise<Worker>[];
export function getWorkers() {
    if (!workers) {
        workers = new Array(navigator.hardwareConcurrency)
            .fill(0)
            .map(async () => new Worker(new URL("worker.js", import.meta.url)));
    }
    return workers;
}



let t = 0;
export async function getWorker() {
    const worker = getWorkers()[t];
    if (!worker) {
        t = 0;
        return getWorker();
    } else {
        t++;
    }
    return worker;
}

export async function getVectorFromTextWithWorker(text: string[]): Promise<number[]> {
    const worker = await getWorker();
    const id = randomCouchString(6);
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
