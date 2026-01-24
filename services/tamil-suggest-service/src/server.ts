import Fastify from "fastify";
import { createPool } from "./db/pg.js";
import { loadCorpus } from "./db/loaders.js";
import { buildBigramMap, buildIndex, registerSuggestRoutes, SuggestEngine } from "./suggest/suggestController.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "tamil-suggest-service" }));

async function main() {
  const port = Number(process.env.PORT || 8080);

  const pg = createPool();
  const corpus = await loadCorpus({ pg });

  const combined = [...corpus.words, ...corpus.phrases];
  const index = buildIndex(combined);
  const bigramMap = buildBigramMap(corpus.bigrams);

  const engine: SuggestEngine = {
    index,
    bigramMap,
    ready: true,
    source: corpus.source,
  };

  registerSuggestRoutes(app, engine);

  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


