"""Runs the golden-set prompts through one GGUF model with llama.cpp and saves the raw outputs.

Mirrors how the app calls the model (src/ai/model.ts): same messages, schema-constrained JSON
(llama.cpp turns the schema into a sampling grammar), temperature 0, 768 new tokens at most,
2048-token context, CPU only. Scoring happens in score.ts, so this file never judges an answer.

Usage: python eval/slm/run_models.py <requests.json> <outputs-dir> <model-id> [<model-id> ...]
"""
import json
import os
import sys
import time

MODELS = json.load(open(os.path.join(os.path.dirname(__file__), "models.json")))


def run_one(spec, requests, out_dir):
    from huggingface_hub import hf_hub_download
    from llama_cpp import Llama

    result = {"id": spec["id"], "status": "ok", "outputs": []}
    path = os.path.join(out_dir, spec["id"] + ".json")
    try:
        gguf = hf_hub_download(repo_id=spec["repo"], filename=spec["file"])
    except Exception as e:  # missing file, gated repo, network
        result.update(status="unavailable", error=f"{type(e).__name__}: {e}"[:300])
        json.dump(result, open(path, "w"), indent=2)
        print(f"[{spec['id']}] unavailable: {result['error']}")
        return
    result["sizeMB"] = os.path.getsize(gguf) / 1e6
    try:
        llm = Llama(model_path=gguf, n_ctx=2048, n_threads=os.cpu_count(), n_gpu_layers=0, verbose=False)
        for req in requests:
            messages = [{"role": "system", "content": req["system"]}, {"role": "user", "content": req["user"]}]
            started = time.time()
            raw, tokens = None, 0
            for attempt in (messages, [{"role": "user", "content": req["system"] + "\n\n" + req["user"]}]):
                try:
                    r = llm.create_chat_completion(
                        messages=attempt,
                        response_format={"type": "json_object", "schema": req["schema"]},
                        temperature=0,
                        max_tokens=768,
                    )
                    raw = r["choices"][0]["message"]["content"]
                    tokens = r["usage"]["completion_tokens"]
                    break
                except Exception as e:  # some chat templates reject a system role
                    err = f"{type(e).__name__}: {e}"[:200]
                    raw = None
            ms = (time.time() - started) * 1000
            result["outputs"].append({"id": req["id"], "raw": raw, "ms": ms, "completionTokens": tokens})
            if raw is None:
                print(f"[{spec['id']}] batch {req['id']} failed: {err}")
        del llm
    except Exception as e:
        result.update(status="failed", error=f"{type(e).__name__}: {e}"[:300])
    json.dump(result, open(path, "w"), indent=2)
    print(f"[{spec['id']}] {result['status']}, {result.get('sizeMB', 0):.0f} MB, {len(result['outputs'])} batches")


def main():
    requests_path, out_dir, *ids = sys.argv[1:]
    requests = json.load(open(requests_path))
    os.makedirs(out_dir, exist_ok=True)
    chosen = [m for m in MODELS if not ids or m["id"] in ids]
    for spec in chosen:
        run_one(spec, requests, out_dir)


if __name__ == "__main__":
    main()
