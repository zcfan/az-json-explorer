import { writeFile } from 'node:fs/promises';

const count = Number.parseInt(process.argv[2] || '50000', 10);
const output = process.argv[3] || new URL('./large-sample.json', import.meta.url);

const records = Array.from({ length: count }, (_, index) => ({
  id: index + 1,
  active: index % 2 === 0,
  payload: JSON.stringify({
    score: index % 100,
    tags: [`group-${index % 10}`, `bucket-${index % 50}`],
  }),
}));

await writeFile(output, JSON.stringify({ count, records }));
console.log(`Wrote ${count} records to ${output}`);
